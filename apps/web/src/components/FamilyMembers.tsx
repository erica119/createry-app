import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

interface FamilyMember {
  id: string;
  family_id: string;
  tenant_id: string;
  name: string;
  age_range: "child" | "teen" | "adult";
  dietary_restrictions: string[];
  notes: string;
}

interface FamilyMembersProps {
  familyId: string;
  tenantId: string;
}

const AGE_RANGES = [
  { value: "child", label: "Child", sublabel: "under 12", emoji: "🧒" },
  { value: "teen", label: "Teen", sublabel: "12–17", emoji: "🧑" },
  { value: "adult", label: "Adult", sublabel: "18+", emoji: "👤" },
];

const DIETARY_OPTIONS = [
  "Vegetarian",
  "Vegan",
  "Gluten-free",
  "Dairy-free",
  "Nut allergy",
  "Shellfish allergy",
  "Egg allergy",
  "Soy-free",
  "Halal",
  "Kosher",
  "Low-sodium",
  "Diabetic-friendly",
];

const emptyMember = (familyId: string, tenantId: string): Omit<FamilyMember, "id"> => ({
  family_id: familyId,
  tenant_id: tenantId,
  name: "",
  age_range: "adult",
  dietary_restrictions: [],
  notes: "",
});

export default function FamilyMembers({ familyId, tenantId }: FamilyMembersProps) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState<Omit<FamilyMember, "id"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMembers();
  }, [familyId]);

  async function fetchMembers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("family_members")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at");
    if (!error && data) setMembers(data);
    setLoading(false);
  }

  function startAdd() {
    setDraft(emptyMember(familyId, tenantId));
    setAddingNew(true);
    setEditingId(null);
  }

  function startEdit(member: FamilyMember) {
    setDraft({ ...member });
    setEditingId(member.id);
    setAddingNew(false);
  }

  function cancelEdit() {
    setDraft(null);
    setEditingId(null);
    setAddingNew(false);
    setError("");
  }

  function toggleRestriction(restriction: string) {
    if (!draft) return;
    const current = draft.dietary_restrictions;
    const updated = current.includes(restriction)
      ? current.filter((r) => r !== restriction)
      : [...current, restriction];
    setDraft({ ...draft, dietary_restrictions: updated });
  }

  async function saveMember() {
    if (!draft) return;
    if (!draft.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError("");

    if (addingNew) {
      const { data, error: err } = await supabase
        .from("family_members")
        .insert([draft])
        .select()
        .single();
      if (err) { setError("Could not save member."); setSaving(false); return; }
      setMembers((prev) => [...prev, data]);
    } else if (editingId) {
      const { error: err } = await supabase
        .from("family_members")
        .update({
          name: draft.name,
          age_range: draft.age_range,
          dietary_restrictions: draft.dietary_restrictions,
          notes: draft.notes,
        })
        .eq("id", editingId);
      if (err) { setError("Could not update member."); setSaving(false); return; }
      setMembers((prev) =>
        prev.map((m) => (m.id === editingId ? { ...m, ...draft } : m))
      );
    }

    setSaving(false);
    cancelEdit();
  }

  async function deleteMember(id: string) {
    if (!confirm("Remove this family member?")) return;
    const { error: err } = await supabase.from("family_members").delete().eq("id", id);
    if (!err) setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  const ageEmoji = (range: string) =>
    AGE_RANGES.find((a) => a.value === range)?.emoji ?? "👤";

  if (loading) return (
    <div style={{ padding: "1rem", color: "var(--color-text-light, #888)", fontSize: "0.9rem" }}>
      Loading family members…
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

      {members.length === 0 && !addingNew && (
        <div style={{
          background: "#faf8f5",
          border: "1.5px dashed #d4c9b0",
          borderRadius: "10px",
          padding: "1.5rem",
          textAlign: "center",
          color: "#8a7a5e",
          fontSize: "0.9rem",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>👨‍👩‍👧‍👦</div>
          <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>No family members yet</div>
          <div>Add individual members so Claude can personalize meals for everyone.</div>
        </div>
      )}

      {members.map((member) =>
        editingId === member.id ? (
          <MemberForm
            key={member.id}
            draft={draft!}
            setDraft={setDraft as any}
            onSave={saveMember}
            onCancel={cancelEdit}
            toggleRestriction={toggleRestriction}
            saving={saving}
            error={error}
          />
        ) : (
          <div
            key={member.id}
            style={{
              background: "#fff",
              border: "1.5px solid #e8e0d0",
              borderRadius: "10px",
              padding: "0.9rem 1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <div style={{
              width: "40px", height: "40px", borderRadius: "50%",
              background: "var(--color-primary-light, #e8f5e9)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.25rem", flexShrink: 0,
            }}>
              {ageEmoji(member.age_range)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#3d2c1e" }}>
                {member.name}
                <span style={{
                  marginLeft: "0.5rem", fontSize: "0.75rem", fontWeight: 500,
                  color: "#8a7a5e", textTransform: "capitalize",
                }}>
                  · {member.age_range}
                </span>
              </div>
              {member.dietary_restrictions.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.3rem" }}>
                  {member.dietary_restrictions.map((r) => (
                    <span key={r} style={{
                      background: "#f0ede6", color: "#6b5a3e",
                      borderRadius: "20px", padding: "0.1rem 0.6rem",
                      fontSize: "0.72rem", fontWeight: 500,
                    }}>{r}</span>
                  ))}
                </div>
              )}
              {member.notes && (
                <div style={{ fontSize: "0.78rem", color: "#9a8a70", marginTop: "0.25rem", fontStyle: "italic" }}>
                  {member.notes}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
              <button
                onClick={() => startEdit(member)}
                style={{
                  background: "none", border: "1.5px solid #d4c9b0",
                  borderRadius: "6px", padding: "0.3rem 0.6rem",
                  cursor: "pointer", fontSize: "0.8rem", color: "#6b5a3e",
                }}
              >Edit</button>
              <button
                onClick={() => deleteMember(member.id)}
                style={{
                  background: "none", border: "1.5px solid #f0d0d0",
                  borderRadius: "6px", padding: "0.3rem 0.6rem",
                  cursor: "pointer", fontSize: "0.8rem", color: "#c0392b",
                }}
              >Remove</button>
            </div>
          </div>
        )
      )}

      {addingNew && (
        <MemberForm
          draft={draft!}
          setDraft={setDraft as any}
          onSave={saveMember}
          onCancel={cancelEdit}
          toggleRestriction={toggleRestriction}
          saving={saving}
          error={error}
        />
      )}

      {!addingNew && !editingId && (
        <button
          onClick={startAdd}
          style={{
            background: "none",
            border: "1.5px dashed var(--color-primary, #5c7c3f)",
            borderRadius: "10px",
            padding: "0.75rem",
            cursor: "pointer",
            color: "var(--color-primary, #5c7c3f)",
            fontWeight: 600,
            fontSize: "0.9rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.4rem",
            transition: "background 0.15s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "#f5faf0")}
          onMouseOut={(e) => (e.currentTarget.style.background = "none")}
        >
          + Add Family Member
        </button>
      )}
    </div>
  );
}

interface MemberFormProps {
  draft: Omit<FamilyMember, "id"> & { id?: string };
  setDraft: (d: any) => void;
  onSave: () => void;
  onCancel: () => void;
  toggleRestriction: (r: string) => void;
  saving: boolean;
  error: string;
}

function MemberForm({ draft, setDraft, onSave, onCancel, toggleRestriction, saving, error }: MemberFormProps) {
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.6rem 0.75rem",
    border: "1.5px solid #d4c9b0",
    borderRadius: "8px",
    fontSize: "0.9rem",
    background: "#faf8f5",
    color: "#3d2c1e",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{
      background: "#faf8f5",
      border: "1.5px solid var(--color-primary, #5c7c3f)",
      borderRadius: "10px",
      padding: "1.1rem",
      display: "flex",
      flexDirection: "column",
      gap: "0.85rem",
    }}>
      <div>
        <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#6b5a3e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Name *
        </label>
        <input
          style={{ ...inputStyle, marginTop: "0.3rem" }}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="e.g. Emma"
        />
      </div>

      <div>
        <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#6b5a3e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Age Range
        </label>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem" }}>
          {AGE_RANGES.map((a) => (
            <button
              key={a.value}
              onClick={() => setDraft({ ...draft, age_range: a.value })}
              style={{
                flex: 1,
                padding: "0.5rem 0.25rem",
                border: "1.5px solid",
                borderColor: draft.age_range === a.value ? "var(--color-primary, #5c7c3f)" : "#d4c9b0",
                borderRadius: "8px",
                background: draft.age_range === a.value ? "var(--color-primary-light, #e8f5e9)" : "#fff",
                cursor: "pointer",
                textAlign: "center",
                fontSize: "0.8rem",
                fontWeight: draft.age_range === a.value ? 700 : 500,
                color: draft.age_range === a.value ? "var(--color-primary, #5c7c3f)" : "#6b5a3e",
              }}
            >
              <div>{a.emoji}</div>
              <div>{a.label}</div>
              <div style={{ fontSize: "0.68rem", opacity: 0.7 }}>{a.sublabel}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#6b5a3e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Dietary Restrictions
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.4rem" }}>
          {DIETARY_OPTIONS.map((opt) => {
            const selected = draft.dietary_restrictions.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => toggleRestriction(opt)}
                style={{
                  padding: "0.3rem 0.65rem",
                  border: "1.5px solid",
                  borderColor: selected ? "var(--color-primary, #5c7c3f)" : "#d4c9b0",
                  borderRadius: "20px",
                  background: selected ? "var(--color-primary, #5c7c3f)" : "#fff",
                  color: selected ? "#fff" : "#6b5a3e",
                  fontSize: "0.78rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#6b5a3e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Notes (optional)
        </label>
        <input
          style={{ ...inputStyle, marginTop: "0.3rem" }}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="e.g. picky eater, loves pasta"
        />
      </div>

      {error && (
        <div style={{ color: "#c0392b", fontSize: "0.82rem", fontWeight: 500 }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "0.55rem 1.1rem", borderRadius: "8px",
            border: "1.5px solid #d4c9b0", background: "#fff",
            cursor: "pointer", fontSize: "0.88rem", color: "#6b5a3e",
          }}
        >Cancel</button>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: "0.55rem 1.25rem", borderRadius: "8px",
            border: "none", background: "var(--color-primary, #5c7c3f)",
            color: "#fff", cursor: saving ? "not-allowed" : "pointer",
            fontSize: "0.88rem", fontWeight: 600, opacity: saving ? 0.7 : 1,
          }}
        >{saving ? "Saving…" : "Save Member"}</button>
      </div>
    </div>
  );
}
