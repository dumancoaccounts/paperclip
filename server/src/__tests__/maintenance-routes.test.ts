import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  maintenanceGateMembers,
  maintenanceWindows,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { maintenanceRoutes } from "../routes/maintenance.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("maintenance routes", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-maintenance-routes-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(maintenanceGateMembers);
    await db.delete(maintenanceWindows);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "board",
        source: "local_implicit",
        userId: "local-board",
        isInstanceAdmin: true,
        companyIds: [],
      };
      next();
    });
    app.use("/api", maintenanceRoutes(db));
    return app;
  }

  it("creates, reports, ready-checks, and resumes a maintenance window", async () => {
    const app = createApp();

    const created = await request(app)
      .post("/api/maintenance/windows")
      .send({ scopeType: "instance", reason: "upgrade", operatorNote: "restart after backup" });
    expect(created.status).toBe(201);
    const windowId = created.body.window.id;
    expect(created.body.status.active).toBe(true);
    expect(created.body.status.readiness.ready).toBe(true);

    const conflict = await request(app)
      .post("/api/maintenance/windows")
      .send({ scopeType: "instance", reason: "second" });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({
      code: "maintenance_gate_active",
      maintenanceWindowId: windowId,
    });

    const ready = await request(app).post(`/api/maintenance/windows/${windowId}/ready-check`).send({});
    expect(ready.status).toBe(200);
    expect(ready.body.window.state).toBe("ready_to_stop");

    const resumed = await request(app)
      .post(`/api/maintenance/windows/${windowId}/resume`)
      .send({ operatorNote: "resume now" });
    expect(resumed.status).toBe(200);
    expect(resumed.body.window.state).toBe("completed");

    const status = await request(app).get("/api/maintenance/status");
    expect(status.status).toBe(200);
    expect(status.body.active).toBe(false);
  });
});
