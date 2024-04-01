import * as t from "tap";
import { Agent } from "../agent/Agent";
import { APIForTesting } from "../agent/api/APIForTesting";
import { runWithContext, type Context } from "../agent/Context";
import { LoggerNoop } from "../agent/logger/LoggerNoop";
import { MySQL2 } from "./MySQL2";

const dangerousContext: Context = {
  remoteAddress: "::1",
  method: "POST",
  url: "http://localhost:4000",
  query: {},
  headers: {},
  body: {
    myTitle: `-- should be blocked`,
  },
  cookies: {},
  source: "express",
};

const safeContext: Context = {
  remoteAddress: "::1",
  method: "POST",
  url: "http://localhost:4000/",
  query: {},
  headers: {},
  body: {},
  cookies: {},
  source: "express",
};

t.test("it detects SQL injections", async () => {
  const agent = new Agent(
    true,
    new LoggerNoop(),
    new APIForTesting(),
    undefined,
    "lambda"
  );
  agent.start([new MySQL2()]);

  const mysql = require("mysql2/promise");

  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "mypassword",
    database: "catsdb",
    port: 27015,
    multipleStatements: true,
  });

  try {
    await connection.query(
      `
        CREATE TABLE IF NOT EXISTS cats (
            petname varchar(255)
        );
      `
    );
    await connection.execute("TRUNCATE cats");
    const [rows] = await connection.query("SELECT petname FROM `cats`;");
    t.same(rows, []);

    const error = await t.rejects(async () => {
      await runWithContext(dangerousContext, () => {
        return connection.query("-- should be blocked");
      });
    });

    if (error instanceof Error) {
      t.same(
        error.message,
        "Aikido runtime has blocked a SQL injection: mysql2.query(...) originating from body.myTitle"
      );
    }

    const undefinedQueryError = await t.rejects(async () => {
      await runWithContext(dangerousContext, () => {
        return connection.query(undefined);
      });
    });

    if (undefinedQueryError instanceof Error) {
      t.same(
        undefinedQueryError.message,
        "Cannot read properties of undefined (reading 'constructor')"
      );
    }

    await runWithContext(safeContext, () => {
      return connection.query("-- This is a comment");
    });

    await runWithContext(safeContext, () => {
      return connection.execute("SELECT 1");
    });
  } catch (error: any) {
    t.fail(error);
  } finally {
    await connection.end();
  }
});
