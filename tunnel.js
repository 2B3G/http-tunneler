#!/usr/bin/env node

const { Command } = require("commander");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const URL_LENGTH = 10;
const program = new Command();
const CONFIG_PATH = "./tunnels.json";
// TODO : maybe make the user put the public port once and save it in some config
let tunnels = getTunnels();

let server = http.createServer((req, res) => {
  // reload the tunnels and check if subpath used in url is in the saved tunnels
  const subpaths = req.url.split("/");
  if (subpaths.length < 2) {
    res.statusCode = 404;
    return res.end();
  }

  const subpath = subpaths[1];

  tunnels = getTunnels();
  const tunnel = tunnels.filter((tunnel) => Object.keys(tunnel) == subpath);

  if (tunnel.length == 0) {
    res.statusCode = 404;
    return res.end();
  } else {
    const port = tunnel[0][subpath];
    if (subpaths[subpaths.length - 1] == "") subpaths.pop();

    // forward the request to http://localhost:{port}/{subpaths} and pipe the response

    let targetUrl = "";
    for (let i = 2; i < subpaths.length; i++) {
      targetUrl += "/" + subpaths[i];
    }
    targetUrl = `http://127.0.0.1:${port}${targetUrl}`;
    const parsedTarget = url.parse(targetUrl);

    const options = {
      hostname: parsedTarget.hostname,
      port: parsedTarget.port,
      path: parsedTarget.path,
      method: req.method,
      headers: req.headers,
    };

    logRequest(targetUrl);

    const tunnelRequest = http.request(options, (externalRes) => {
      res.writeHead(externalRes.statusCode, externalRes.headers);
      externalRes.pipe(res);
    });

    tunnelRequest.on("error", (err) => {
      console.error(
        `[ERROR] unknown error while tunneling to: ${targetUrl}.`,
        err
      );
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end();
    });

    req.pipe(tunnelRequest);
  }
});

program
  .command("add <port>")
  .description("Open tunnel to the specified port")
  .action(async (port) => {
    port = parseInt(port);
    if (isNaN(port)) {
      console.log(`[ERROR] Provided port is not a number.`);
    }

    const path = generatePath();
    try {
      addTunnel(path, port);
      console.log(`[SUCCESS] http://${await getIp()}:<public_port>/${path}/`);
    } catch (e) {
      console.log(e.message);
    }
  });

program
  .command("remove <port>")
  .description("Close tunnel to the specified port")
  .action(async (port) => {
    port = parseInt(port);
    if (isNaN(port)) {
      console.log(`[ERROR] Provided port is not a number.`);
    }

    removeTunnel(port);
  });

program
  .command("start <port>")
  .description("Starts the tunneling server at the specified public port")
  .action((port) => {
    if (tunnels.filter((v) => Object.values(v)[0] == port).length != 0) {
      return console.log(
        `[ERROR] this port is connected to an existing tunnel. to see all tunnels run tunnel -l' and to remove the port run 'tunnel remove ${port}'`
      );
    }

    server
      .listen(port, () =>
        console.log(
          "[SUCCESS] Tunnel server started ! Run tunnel <port> to open a tunnel to it"
        )
      )
      .on("error", (e) => {
        if (e.code === "EADDRINUSE") {
          console.log(
            "[ERROR] port already in use. the tunneler may be running already"
          );
        } else throw e;
      });
  });

program
  .option("-c, --config_path", "Show the path to the saved tunnels file")
  .action(() => {}); // without this the flag doesnt work

program
  .option(
    "-l, --list",
    "List all the tunnel ports and the corespoding subpaths"
  )
  .action(() => {}); // without this the flag doesnt work

program.parse(process.argv);

if (program.opts().config_path) console.log(path.join(__dirname, CONFIG_PATH));
if (program.opts().list) {
  tunnels = getTunnels();
  tunnels.forEach((tunnel) => {
    console.log(`[${Object.values(tunnel)[0]}] ${Object.keys(tunnel)[0]}`);
  });
}

function logRequest(url) {
  console.log("[REQUEST] Target url: " + url);
}

function generatePath() {
  const alphabet = [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
  ];

  let result = "";
  for (let i = 0; i < URL_LENGTH; i++) {
    result += alphabet[Math.round(Math.random() * 50)];
  }

  return result;
}

function getIp() {
  return new Promise((resolve) => {
    https.get("https://api.ipify.org?format=json", (res) => {
      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks);

        resolve(JSON.parse(body.toString()).ip);
      });
    });
  });
}

function getTunnels() {
  if (!fs.existsSync(CONFIG_PATH)) {
    createConfig();
    return {};
  }
  const jsonData = fs.readFileSync(CONFIG_PATH, "utf8");

  return jsonData == "" ? [] : JSON.parse(jsonData).tunnels;
}

function createConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ tunnels: tunnels ?? [] }));
}

function addTunnel(path, port) {
  const existingPath = tunnels.filter((v) => Object.values(v)[0] == port);

  if (!fs.existsSync(CONFIG_PATH)) {
    createConfig();
  } else if (existingPath.length != 0) {
    throw new Error(
      "[ERROR] port already used on subpath: " + Object.keys(existingPath[0])
    );
  }

  tunnels.push({
    [path]: port,
  });

  saveTunnels();
}

function saveTunnels() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ tunnels: tunnels }));
}

function removeTunnel(port) {
  tunnels = tunnels.filter((v) => Object.values(v)[0] != port);
  saveTunnels();
}
