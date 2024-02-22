import * as t from "tap";
import { Agent } from "../agent/Agent";
import { setInstance } from "../agent/AgentSingleton";
import { APIForTesting, Token } from "../agent/API";
import { LoggerNoop } from "../agent/Logger";
import { runWithContext, type Context } from "../agent/Context";
import { Mysql2 } from "../sinks/Mysql2";
import type { Connection } from "mysql2";

async function initDb(connection: Connection) {
  // This creates the cats table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS cats (
        petname varchar(255)
    );
    `);
}

const context: Context = {
  remoteAddress: "::1",
  method: "POST",
  url: "http://localhost:4000",
  query: {},
  headers: {},
  body: {
    myTitle: `-- should be blocked`,
  },
  cookies: {},
};
let connection: Connection;

t.test("We can hijack mysql2 class", async () => {
  const mysql2 = new Mysql2();
  mysql2.wrap();
  const mysql = require("mysql2/promise");

  const agent = new Agent(
    true,
    new LoggerNoop(),
    new APIForTesting(),
    new Token("123"),
    false,
    {}
  );
  agent.start();
  setInstance(agent);

  connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "mypassword",
    database: "catsdb",
    port: 27015,
    multipleStatements: true,
  });

  try {
    // Execute 2 queries
    await initDb(connection);
    const cats2 = await connection.query("SELECT petname FROM `cats`;");

    // @ts-expect-error Private property
    t.same(agent.stats, {
      mysql2: {
        blocked: 0,
        total: 2,
        allowed: 2,
        withoutContext: 2,
      },
    });
    // @ts-expect-error
    console.log(agent.stats)

    const bulkError = await t.rejects(async () => {
      await runWithContext(context, () => {
        return connection.query("-- should be blocked");
      });
    });
    if (bulkError instanceof Error) {
      t.equal(
        bulkError.message,
        "Aikido guard has blocked a SQL injection: -- should be blocked originating from body"
      );
    }

    // @ts-expect-error null is normally not a valid agent
    setInstance(null); // We want to check if the code works when an Agent is not defined.
    await runWithContext(context, () => {
      // Normally this should be detected, but since the agent
      // is not defined we let it through.
      return connection.query("-- should be blocked");
    });
    setInstance(agent); // Put the agent back for the following tests

    const undefinedQueryError = await t.rejects(async () => {
      await runWithContext(context, () => {
        // @ts-expect-error
        return connection.query(null);
      });
    });
    if (undefinedQueryError instanceof Error) {
      t.equal(
        undefinedQueryError.message,
        "Cannot read property 'constructor' of null"
      );
    }

    await runWithContext(
      {
        remoteAddress: "::1",
        method: "POST",
        url: "http://localhost:4000/",
        query: {},
        headers: {},
        body: {},
        cookies: {},
      },
      () => {
        return connection.query("-- This is a comment");
      }
    );
  } catch (error: any) {
    t.fail(error);
  } finally {
    await connection.end();
  }
});
