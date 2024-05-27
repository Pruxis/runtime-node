import * as t from "tap";
import { Agent } from "../agent/Agent";
import { ReportingAPIForTesting } from "../agent/api/ReportingAPIForTesting";
import { getContext } from "../agent/Context";
import { LoggerNoop } from "../agent/logger/LoggerNoop";
import { fetch } from "../helpers/fetch";
import { HTTPServer } from "./HTTPServer";

// Before require("http")
const agent = new Agent(
  true,
  new LoggerNoop(),
  new ReportingAPIForTesting(),
  undefined,
  "lambda"
);
agent.start([new HTTPServer()]);

t.test("it wraps the createServer function of http module", async () => {
  const http = require("http");
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(getContext()));
  });

  http.globalAgent = new http.Agent({ keepAlive: false });

  await new Promise<void>((resolve) => {
    server.listen(3314, () => {
      fetch({
        url: new URL("http://localhost:3314"),
        method: "GET",
        headers: {},
        timeoutInMS: 500,
      }).then(({ body }) => {
        const context = JSON.parse(body);
        t.same(context, {
          url: "/",
          method: "GET",
          headers: { host: "localhost:3314", connection: "close" },
          query: {},
          source: "http.createServer",
          routeParams: {},
          cookies: {},
          remoteAddress: process.version.startsWith("v16")
            ? "::ffff:127.0.0.1"
            : "::1",
        });
        server.close();
        resolve();
      });
    });
  });
});

t.test("it wraps the createServer function of https module", async () => {
  const https = require("https");
  const { readFileSync } = require("fs");
  const path = require("path");

  // Otherwise, the self-signed certificate will be rejected
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const server = https.createServer(
    {
      key: readFileSync(path.resolve(__dirname, "fixtures/key.pem")),
      cert: readFileSync(path.resolve(__dirname, "fixtures/cert.pem")),
      secureContext: {},
    },
    (req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(getContext()));
    }
  );

  https.globalAgent = new https.Agent({ keepAlive: false });

  await new Promise<void>((resolve) => {
    server.listen(3315, () => {
      fetch({
        url: new URL("https://localhost:3315"),
        method: "GET",
        headers: {},
        timeoutInMS: 500,
      }).then(({ body }) => {
        const context = JSON.parse(body);
        t.same(context, {
          url: "/",
          method: "GET",
          headers: { host: "localhost:3315", connection: "close" },
          query: {},
          source: "https.createServer",
          routeParams: {},
          cookies: {},
          remoteAddress: process.version.startsWith("v16")
            ? "::ffff:127.0.0.1"
            : "::1",
        });
        server.close();
        resolve();
      });
    });
  });
});

t.test("it parses query parameters", async () => {
  const http = require("http");
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(getContext()));
  });

  await new Promise<void>((resolve) => {
    server.listen(3317, () => {
      fetch({
        url: new URL("http://localhost:3317?foo=bar&baz=qux"),
        method: "GET",
        headers: {},
        timeoutInMS: 500,
      }).then(({ body }) => {
        const context = JSON.parse(body);
        t.same(context.query, { foo: "bar", baz: "qux" });
        server.close();
        resolve();
      });
    });
  });
});

t.test("it parses cookies", async () => {
  const http = require("http");
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(getContext()));
  });

  await new Promise<void>((resolve) => {
    server.listen(3318, () => {
      fetch({
        url: new URL("http://localhost:3318"),
        method: "GET",
        headers: {
          Cookie: "foo=bar; baz=qux",
        },
        timeoutInMS: 500,
      }).then(({ body }) => {
        const context = JSON.parse(body);
        t.same(context.cookies, { foo: "bar", baz: "qux" });
        server.close();
        resolve();
      });
    });
  });
});

t.test("it parses x-forwarded-for header with proxy", async () => {
  const http = require("http");
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(getContext()));
  });

  await new Promise<void>((resolve) => {
    server.listen(3316, () => {
      fetch({
        url: new URL("http://localhost:3316"),
        method: "GET",
        headers: {
          "x-forwarded-for":
            "203.0.113.195,2001:db8:85a3:8d3:1319:8a2e:370:7348,198.51.100.178",
        },
        timeoutInMS: 500,
      }).then(({ body }) => {
        const context = JSON.parse(body);
        t.same(context.remoteAddress, "203.0.113.195");
        server.close();
        resolve();
      });
    });
  });
});

t.test("it uses x-forwarded-for header", async () => {
  const http = require("http");
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(getContext()));
  });

  await new Promise<void>((resolve) => {
    server.listen(3316, () => {
      fetch({
        url: new URL("http://localhost:3316"),
        method: "GET",
        headers: {
          "x-forwarded-for": "203.0.113.195",
        },
        timeoutInMS: 500,
      }).then(({ body }) => {
        const context = JSON.parse(body);
        t.same(context.remoteAddress, "203.0.113.195");
        server.close();
        resolve();
      });
    });
  });
});

t.test("it sets body in context", async () => {
  const http = require("http");
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(getContext()));
  });

  await new Promise<void>((resolve) => {
    server.listen(3319, () => {
      fetch({
        url: new URL("http://localhost:3319"),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ foo: "bar" }),
        timeoutInMS: 500,
      }).then(({ body }) => {
        const context = JSON.parse(body);
        t.same(context.body, { foo: "bar" });
        server.close();
        resolve();
      });
    });
  });
});

t.test("it stops reading body when it exceeds the limit", async () => {
  const http = require("http");
  const server = http.createServer((req, res) => {
    let bodySize = 0;
    req.on("data", (chunk) => {
      bodySize += chunk.length;
    });
    req.on("end", () => {
      t.same(bodySize, 2e6);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(getContext()));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(3320, () => {
      fetch({
        url: new URL("http://localhost:3320"),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "a".repeat(2e6),
        timeoutInMS: 500,
      }).then(({ body }) => {
        const context = JSON.parse(body);
        t.same(context.body, undefined);
        server.close();
        resolve();
      });
    });
  });
});
