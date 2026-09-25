import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, LogOut, Trash2, TriangleAlert, UserCheck, UserPlus, UserX } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { ROLE_LABEL } from "../format";
import { Avatar, FormError, Modal, PageHeader, PageLoader } from "../components/ui";
import { useToast } from "../components/toast";
import type { Role, User } from "../types";

const ROLE_TONE: Record<Role, string> = {
  ADMIN: "badge-violet",
  DOCTOR: "badge-info",
  SECRETARY: "badge-neutral",
};

const ROLE_HELP: Record<Role, string> = {
  ADMIN: "Acesso total, incluindo equipe e configurações",
  DOCTOR: "Consultas, pacientes e financeiro",
  SECRETARY: "Pacientes e financeiro não acessa as consultas clínicas",
};

export function TeamPage() {
  const { session } = useAuth();
  const toast = useToast();
  const isAdmin = session!.user.role === "ADMIN";
  const [users, setUsers] = useState<User[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<User | null>(null);

  const load = useCallback(() => {
    api.get<User[]>("/users").then(setUsers);
  }, []);
  useEffect(load, [load]);

  async function toggleActive(u: User) {
    try {
      await api.patch(`/users/${u.id}`, { active: !u.active });
      toast(u.active ? `${u.name} foi desativado(a)` : `${u.name} foi reativado(a)`);
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function revokeSessions(u: User) {
    if (!confirm(`Desconectar ${u.name} de todos os aparelhos? Será preciso entrar de novo.`)) return;
    try {
      await api.post(`/users/${u.id}/revoke-sessions`);
      toast(`Sessões de ${u.name} encerradas`);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Equipe"
        subtitle="Pessoas com acesso ao sistema desta clínica"
        actions={
          isAdmin && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <UserPlus size={17} /> Adicionar pessoa
            </button>
          )
        }
      />

      {!users ? (
        <PageLoader />
      ) : (
        <div className="member-grid">
          {users.map((u) => {
            const isMe = u.id === session!.user.id;
            const canManage = isAdmin && !isMe;
            return (
              <div key={u.id} className={`card member ${u.active ? "" : "inactive"}`}>
                <div className="member-body">
                  <div className="member-head">
                    <Avatar name={u.name} />
                    <div className="member-id">
                      <strong title={u.name}>{u.name}</strong>
                      <small title={u.email}>{u.email}</small>
                    </div>
                    {isMe && <span className="badge badge-info no-dot member-you">Você</span>}
                    {canManage && (
                      <button
                        className="btn btn-ghost btn-icon member-delete"
                        onClick={() => setRemoving(u)}
                        title="Apagar conta"
                        aria-label={`Apagar a conta de ${u.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="member-tags">
                    <span className={`badge no-dot ${ROLE_TONE[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                    <span className={`badge ${u.active ? "badge-success" : "badge-neutral"}`}>{u.active ? "Ativo" : "Inativo"}</span>
                  </div>
                </div>
                {canManage && (
                  <div className="member-actions">
                    {u.active && (
                      <button className="btn btn-sm btn-ghost" onClick={() => revokeSessions(u)} title="Desconecta todos os aparelhos desta pessoa">
                        <LogOut size={14} /> Encerrar sessões
                      </button>
                    )}
                    <button
                      className={`btn btn-sm ${u.active ? "btn-danger-ghost" : "btn-secondary"}`}
                      onClick={() => toggleActive(u)}
                    >
                      {u.active ? <UserX size={14} /> : <UserCheck size={14} />}
                      {u.active ? "Desativar" : "Reativar"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {removing && (
        <DeleteMemberModal
          user={removing}
          onClose={() => setRemoving(null)}
          onDeleted={() => {
            toast(`Conta de ${removing.name} apagada`);
            setRemoving(null);
            load();
          }}
          onDeactivate={() => {
            const u = removing;
            setRemoving(null);
            void toggleActive(u);
          }}
        />
      )}

      {adding && (
        <Modal title="Adicionar pessoa" subtitle="Ela entra com o e-mail e a senha provisória" onClose={() => setAdding(false)}>
          <NewMemberForm
            onCreated={() => {
              setAdding(false);
              toast("Pessoa adicionada à equipe");
              load();
            }}
            onCancel={() => setAdding(false)}
          />
        </Modal>
      )}
    </>
  );
}

/**
 * Confirmação de exclusão. A regra de verdade está no servidor: ele recusa apagar quem já atendeu
 * (o prontuário precisa ser guardado) e quem tenta apagar a si mesmo. Aqui só avisamos antes.
 */
function DeleteMemberModal({
  user,
  onClose,
  onDeleted,
  onDeactivate,
}: {
  user: User;
  onClose: () => void;
  onDeleted: () => void;
  onDeactivate: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attended = (user.consultationCount ?? 0) > 0;

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await api.delete(`/users/${user.id}`);
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Apagar conta" subtitle={user.email} onClose={onClose} width={460}>
      {attended ? (
        <div className="form-grid">
          <div className="alert alert-warning col-span-2">
            <TriangleAlert size={18} />
            <div>
              <strong>{user.name}</strong> atendeu {user.consultationCount} consulta{user.consultationCount! > 1 ? "s" : ""} o
              prontuário precisa ser guardado com o nome de quem atendeu, então esta conta não pode ser apagada
              {user.active && " você pode desativá-la a pessoa perde o acesso na hora"}
            </div>
          </div>
          <div className="btn-row col-span-2" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Fechar
            </button>
            {user.active && (
              <button type="button" className="btn btn-danger" onClick={onDeactivate}>
                <UserX size={16} /> Desativar acesso
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="form-grid">
          <p className="col-span-2" style={{ margin: 0 }}>
            A conta de <strong>{user.name}</strong> será apagada de vez e a pessoa será desconectada de todos os aparelhos. Isso
            não pode ser desfeito.
          </p>
          <FormError message={error} />
          <div className="btn-row col-span-2" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
              Apagar de vez
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function NewMemberForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "SECRETARY" as Role });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/users", form);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label className="field col-span-2">
        <span className="field-label">Nome</span>
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
      </label>
      <label className="field">
        <span className="field-label">E-mail</span>
        <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </label>
      <label className="field">
        <span className="field-label">Senha provisória</span>
        <input
          className="input"
          type="password"
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <span className="field-hint">Mínimo de 8 caracteres</span>
      </label>
      <label className="field col-span-2">
        <span className="field-label">Perfil de acesso</span>
        <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="field-hint">{ROLE_HELP[form.role]}</span>
      </label>
      <FormError message={error} />
      <div className="btn-row col-span-2" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy && <LoaderCircle size={16} className="spin" />}
          Adicionar
        </button>
      </div>
    </form>
  );
}
