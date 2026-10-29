/** Port of tos/TosController. */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { currentUser } from "../../lib/auth";
import { ctxFromHono } from "../../lib/ctx";
import { UserNotFoundException } from "../../lib/errors";
import * as TosEntity from "../../entities/Tos";
import * as UserRepository from "../user/UserRepository";
import { USER_NOT_FOUND_MESSAGE } from "../user/UserService";
import * as TosService from "./TosService";

const app = new Hono<AppEnv>();

app.get("/tos", async (c) => {
  const latestTos = await TosService.getActiveTos(ctxFromHono(c));
  if (latestTos) return c.json(TosEntity.toJson(latestTos));
  return c.text("No Terms of service available");
});

app.post("/tos/accept", async (c) => {
  const ctx = ctxFromHono(c);
  // @RequestParam also binds form fields: the frontend posts `tosId` as x-www-form-urlencoded.
  let tosId: string | undefined = c.req.query("tosId");
  const contentType = c.req.header("Content-Type") ?? "";
  if (tosId === undefined && /application\/x-www-form-urlencoded|multipart\/form-data/i.test(contentType)) {
    const field = (await c.req.parseBody())["tosId"];
    if (typeof field === "string") tosId = field;
  }
  if (tosId === undefined) {
    // MissingServletRequestParameterException falls through to the generic Exception handler.
    return c.json(
      {
        error:
          "Unexpected Error: Something went wrong. Details: Required request parameter 'tosId' for method parameter type String is not present",
        type: "INTERNAL_SERVER_ERROR",
      },
      500,
    );
  }
  const user = await UserRepository.findByEmail(ctx.db, currentUser(c).email);
  if (!user) throw new UserNotFoundException(USER_NOT_FOUND_MESSAGE);
  return c.json(await TosService.acceptTos(ctx, user, tosId));
});

export default app;
