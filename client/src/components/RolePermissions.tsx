import { useEffect, useState } from "react";
import { LoaderCircle, Lock } from "lucide-react";
import { api } from "../api";
import { ROLE_LABEL } from "../format";
import { useToast } from "./toast";
import { useCatalog } from "../auth";
import type { Permission } from "../types";

type Editable = "DOCTOR" | "SECRETARY";
interface RolePermissions {
  modules: Permission[];
  DOCTOR: Permission[];
  SECRETARY: Permission[];
}

const ROLES: Editable[] = ["DOCTOR", "SECRETARY"];

/**
 * A administração da clínica distribui entre os cargos os módulos que a Arka liberou para a clínica.
 * Só aparece o que a clínica tem; quem decide de verdade é o servidor.
 */
export function RolePermissionsCard() {
  const toast = useToast();
  const { label } = useCatalog();
  const [saved, setSaved] = useState<RolePermissions | null>(null);
  const [draft, setDraft] = useState<RolePermissions | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<RolePermissions>("/users/role-permissions").then((r) => {
      setSaved(r);
      setDraft(r);
    });
  }, []);

  if (!draft || !saved) return null;

  function toggle(role: Editable, p: Permission) {
    setDraft((d) => {
      const set = new Set(d![role]);
      if (set.has(p)) {
        set.delete(p);
        if (p === "PATIENTS") set.delete("CONSULTATIONS");
      } else {
        set.add(p);
        if (p === "CONSULTATIONS" && d!.modules.includes("PATIENTS")) set.add("PATIENTS");
      }
      return { ...d!, [role]: d!.modules.filter((m) => set.has(m)) };
    });
  }

  const dirty = ROLES.some((r) => draft[r].join() !== saved[r].join());

  async function save() {
    setBusy(true);
    try {
      const r = await api.put<RolePermissions>("/users/role-permissions", { DOCTOR: draft!.DOCTOR, SECRETARY: draft!.SECRETARY });
      setSaved(r);
      setDraft(r);
      toast("Permissões dos cargos salvas");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card role-perms">
      <div className="card-header">
        <div>
          <h2 className="card-title">O que cada cargo acessa</h2>
          <p className="card-subtitle">Vale na hora para todos desta clínica aparecem só os módulos que a clínica tem</p>
        </div>
        <div className="btn-row">
          {dirty && (
            <button className="btn btn-secondary btn-sm" onClick={() => setDraft(saved)} disabled={busy}>
              Desfazer
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || busy}>
            {busy && <LoaderCircle size={14} className="spin" />}
            Salvar
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table perm-table">
          <caption className="sr-only">Permissões por cargo nesta clínica</caption>
          <thead>
            <tr>
              <th scope="col">Cargo</th>
              {draft.modules.map((m) => (
                <th key={m} scope="col">
                  <span className="perm-col">{label(m)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="is-locked">
              <th scope="row">
                {ROLE_LABEL.ADMIN}
                <small>
                  <Lock size={12} /> Sempre tudo o que a clínica tem
                </small>
              </th>
              {draft.modules.map((m) => (
                <td key={m}>
                  <input type="checkbox" className="perm-check" checked disabled aria-label={`${ROLE_LABEL.ADMIN}: ${label(m)}`} />
                </td>
              ))}
            </tr>
            {ROLES.map((role) => (
              <tr key={role}>
                <th scope="row">{ROLE_LABEL[role]}</th>
                {draft.modules.map((m) => (
                  <td key={m}>
                    <input
                      type="checkbox"
                      className="perm-check"
                      checked={draft[role].includes(m)}
                      onChange={() => toggle(role, m)}
                      aria-label={`${ROLE_LABEL[role]}: ${label(m)}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
