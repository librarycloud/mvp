import fastifyJwt from "@fastify/jwt";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaxController } from "../src/modules/tax/tax.controller.js";
import { taxRoutes } from "../src/modules/tax/tax.routes.js";

describe("tax declaration routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function setup() {
    const app = Fastify();
    apps.push(app);
    await app.register(fastifyJwt, { secret: "test-tax-route-secret" });

    const prepare = vi.fn(async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(request.body);
    });
    const noop = async (_request: FastifyRequest, reply: FastifyReply) => reply.send({});
    const controller = {
      input: noop,
      output: noop,
      foundation: noop,
      listDeclarations: noop,
      declaration: noop,
      prepare,
      updateLines: noop,
      review: noop,
      declare: noop,
      pay: noop,
    } as unknown as TaxController;

    await app.register(taxRoutes, { prefix: "/api/v1/tax", controller });
    await app.ready();
    const token = app.jwt.sign({ sub: "1", jti: "tax-route-test", role: "ACCOUNTANT", type: "access" });
    return { app, prepare, authorization: `Bearer ${token}` };
  }

  it("keeps taxType in a valid declaration request", async () => {
    const { app, prepare, authorization } = await setup();
    const payload = { taxType: "VAT", periodType: "MONTH", fiscalYear: 2026, period: 8 };

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tax/declarations",
      headers: { authorization },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(payload);
    expect(prepare).toHaveBeenCalledOnce();
  });

  it("rejects a declaration request that genuinely omits taxType", async () => {
    const { app, prepare, authorization } = await setup();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tax/declarations",
      headers: { authorization },
      payload: { periodType: "MONTH", fiscalYear: 2026, period: 8 },
    });

    expect(response.statusCode).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });
});
