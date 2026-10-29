/** Port of tos/TosService + TosServiceImpl. `getActiveTos` returns `Tos | null` (Java Optional). */
import type { Ctx } from "../../lib/ctx";
import { RuntimeException } from "../../lib/errors";
import * as TosEntity from "../../entities/Tos";
import type { Tos } from "../../entities/Tos";
import type { User } from "../../entities/User";
import * as JwtAuthenticationResponse from "../authentication/dto/JwtAuthenticationResponse";
import * as JwtService from "../authentication/service/JwtService";
import type { UserDetailsLike } from "../authentication/service/TokenProvider";
import * as UserService from "../user/UserService";
import * as TosRepository from "./TosRepository";
import * as TosTokenProviderImpl from "./TosTokenProviderImpl";

export async function getActiveTos(ctx: Ctx): Promise<Tos | null> {
  const tosType = ctx.env.TOS_TYPE;
  // java.lang.IllegalStateException -> RuntimeException handler (500 RUNTIME_ERROR).
  if (tosType == null || tosType.trim() === "") {
    throw new RuntimeException("TOS_TYPE environment variable is not configured");
  }
  return TosRepository.findFirstByIsActiveTrueAndTypeOrderByCreatedAtDesc(ctx.db, tosType);
}

export async function createNewTos(ctx: Ctx, content: string, type: string): Promise<Tos> {
  const newTos = TosEntity.createWithContent(content);
  newTos.type = type;
  newTos.isActive = true;
  // Deactivate all existing TOS entries of the same type, then insert the new one (atomically).
  await ctx.db.batch([
    ctx.db.prepare(`UPDATE "${TosEntity.TABLE}" SET is_active = 0 WHERE type = ?`).bind(type),
    TosRepository.saveStmt(ctx.db, newTos),
  ]);
  return newTos;
}

export async function deactivateTos(ctx: Ctx, tosId: string): Promise<void> {
  const tos = await TosRepository.findById(ctx.db, tosId);
  if (!tos) throw new RuntimeException("Tos Not found");
  if (tos.isActive) {
    tos.isActive = false;
    await TosRepository.save(ctx.db, tos);
  }
}

export async function extractUserName(ctx: Ctx, token: string): Promise<string> {
  return TosTokenProviderImpl.extractUserName(ctx, token);
}

export async function generateToken(ctx: Ctx, userDetails: UserDetailsLike): Promise<string> {
  return TosTokenProviderImpl.generateToken(ctx, {}, userDetails);
}

export async function acceptTos(
  ctx: Ctx,
  user: User,
  tosId: string,
): Promise<JwtAuthenticationResponse.JwtAuthenticationResponse> {
  const tos = await TosRepository.findById(ctx.db, tosId);
  if (tos && tos.isActive) {
    await UserService.addTosIdToUser(ctx, user, tosId);
    const jwt = await JwtService.generateToken(ctx, user);
    return JwtAuthenticationResponse.build({
      token: jwt,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    });
  }
  throw new RuntimeException("Invalid TOS version");
}
