"use client";
/**
 * What the signed-in Control Center operator may do, for any page to read:
 *
 *   const { can } = useControlAccess();
 *   {can('schools.edit') && <button …>}
 *
 * Hiding a control is a courtesy — every API route enforces the same
 * permission server-side (lib/control/guard), so a hidden button that someone
 * re-creates still gets a 403.
 */
import { createContext, useContext } from "react";

const Ctx = createContext({ user: null, can: () => false, isSuperAdmin: false });

export function ControlAccessProvider({ user, children }) {
  const isSuperAdmin = user?.role === "XHENVOLT_SUPER_ADMIN";
  const set = new Set(user?.permissions ?? []);
  const can = (p) => isSuperAdmin || set.has(p);
  return <Ctx.Provider value={{ user, can, isSuperAdmin }}>{children}</Ctx.Provider>;
}

export const useControlAccess = () => useContext(Ctx);

/** Renders children only when the operator holds the permission. */
export function Can({ permission, children, fallback = null }) {
  const { can } = useControlAccess();
  return can(permission) ? children : fallback;
}
