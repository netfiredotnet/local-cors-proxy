var express = require("express");
var request = require("request");
var cors = require("cors");
var chalk = require("chalk");
var ioServer = require("socket.io");
var ioClient = require("socket.io-client");
var proxy = express();

var startProxy = function (port, proxyUrl, proxyPartial, credentials, origin) {
  proxy.use(cors({ credentials: credentials, origin: origin }));
  proxy.options("*", cors({ credentials: credentials, origin: origin }));

  // remove trailing slash
  var cleanProxyUrl = proxyUrl.replace(/\/$/, "");
  // remove all forward slashes
  var cleanProxyPartial = proxyPartial.replace(/\//g, "");

  proxy.use("/" + cleanProxyPartial, function (req, res) {
    req
      .pipe(
        request(cleanProxyUrl + req.url).on("response", (response) => {
          // In order to avoid https://github.com/expressjs/cors/issues/134
          const accessControlAllowOriginHeader = response.headers["access-control-allow-origin"];
          if (accessControlAllowOriginHeader && accessControlAllowOriginHeader !== origin) {
            try {
              console.log(
                `${chalk.green("Request Proxied")} ${chalk.magenta(
                  "[Override access-control-allow-origin header: " + accessControlAllowOriginHeader + "]"
                )} ${chalk.green("->")} ${chalk.white(req.url)}`
              );
            } catch (e) {}
            response.headers["access-control-allow-origin"] = origin;
          } else {
            try {
              console.log(`${chalk.green("Request Proxied -> ")} ${chalk.white(req.url)}`);
            } catch (e) {}
          }
        })
      )
      .pipe(res);
  });

  var server = proxy.listen(port);
  const ios = new ioServer.Server(server, {
    cors: { credentials: credentials, origin: origin },
  });
  ios.on("connection", (proxySocket) => {
    // A connection has been made to our WS proxy server from the browser/client
    proxySocket.on("new_namespace", (namespace) => {
      console.log(chalk.yellow(`Browser/client created new WS namespace: ${chalk.white(namespace.name)}`));
    });
    proxySocket.on("disconnect", (reason) => {
      console.log(chalk.red(`Browser/client has disconnected from WS proxy: ${chalk.white(reason)}`));
    });
    console.log(
      chalk.yellow(`Browser/client has connected to WS proxy with namespace: ${chalk.white(proxySocket.nsp.name)}`)
    );
    console.log(
      chalk.yellow(`Attempting WS connection to upstream server: ${chalk.white(cleanProxyUrl + proxySocket.nsp.name)}`)
    );
    const upstreamSocket = ioClient(cleanProxyUrl + proxySocket.nsp.name);
    upstreamSocket.on("connect", () => {
      console.log(chalk.yellow(`WS proxy has connected to upstream server`));
    });
    upstreamSocket.on("disconnect", (reason) => {
      console.log(chalk.red(`WS proxy was disconnected from upstream server: ${chalk.white(reason)}`));
    });
    upstreamSocket.on("connect_error", (error) => {
      console.log(
        chalk.red(
          `WS proxy encountered namespace middleware error on connection to upstream server: ${chalk.white(error)}`
        )
      );
    });
    upstreamSocket.onAny((event, ...args) => {
      console.log(
        chalk.yellow(`WS proxy received event from upstream server: ${chalk.white(event)} (args ${args.join(", ")})`)
      );
      proxySocket.emit(event, ...args);
    });
    proxySocket.onAny((event, ...args) => {
      console.log(
        chalk.yellow(`WS proxy received event from browser/client: ${chalk.white(event)} (args ${args.join(", ")})`)
      );
      upstreamSocket.emit(event, ...args);
    });
  });

  // Welcome Message
  console.log(chalk.bgGreen.black.bold.underline("\n Proxy Active (WS enabled)\n"));
  console.log(chalk.blue("Proxy Url: " + chalk.green(cleanProxyUrl)));
  console.log(chalk.blue("Proxy Partial: " + chalk.green(cleanProxyPartial)));
  console.log(chalk.blue("PORT: " + chalk.green(port)));
  console.log(chalk.blue("Credentials: " + chalk.green(credentials)));
  console.log(chalk.blue("Origin: " + chalk.green(origin) + "\n"));
  console.log(
    chalk.cyan(
      "To start using the proxy simply replace the proxied part of your url with: " +
        chalk.bold("http://localhost:" + port + "/" + cleanProxyPartial + "\n")
    )
  );
};

exports.startProxy = startProxy;
