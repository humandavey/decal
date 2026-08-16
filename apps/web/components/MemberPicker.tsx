"use client";

export interface MemberOption {
  id: string;
  name: string | null;
  color: string;
}

interface MemberPickerBaseProps {
  members: MemberOption[];
  /** Extra chip at the front for "nobody in particular." Its id is "". */
  allowUnassigned?: boolean;
  unassignedLabel?: string;
}

interface SinglePickerProps extends MemberPickerBaseProps {
  mode: "single";
  selected: string | null;
  onChange: (id: string | null) => void;
}

interface MultiPickerProps extends MemberPickerBaseProps {
  mode: "multi";
  selected: string[];
  onChange: (ids: string[]) => void;
}

type MemberPickerProps = SinglePickerProps | MultiPickerProps;

function initials(name: string | null) {
  const source = name?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/** A row of large, thumb-friendly chips for picking one (or several) family
 * members — used anywhere a chore, to-do, or meal needs an assignee. */
export function MemberPicker(props: MemberPickerProps) {
  const { members, allowUnassigned, unassignedLabel } = props;

  function isActive(id: string) {
    return props.mode === "single" ? props.selected === id : props.selected.includes(id);
  }

  function toggle(id: string) {
    if (props.mode === "single") {
      props.onChange(props.selected === id ? null : id === "" ? null : id);
      return;
    }
    const next = props.selected.includes(id)
      ? props.selected.filter((existing) => existing !== id)
      : [...props.selected, id];
    props.onChange(next);
  }

  return (
    <div style={styles.row}>
      {allowUnassigned && (
        <button
          type="button"
          onClick={() => toggle("")}
          style={{
            ...styles.chip,
            ...(props.mode === "single" && !props.selected ? styles.chipActiveNeutral : {})
          }}
        >
          {unassignedLabel ?? "Anyone"}
        </button>
      )}
      {members.map((member) => {
        const active = isActive(member.id);
        return (
          <button
            key={member.id}
            type="button"
            onClick={() => toggle(member.id)}
            style={{
              ...styles.chip,
              ...(active
                ? { background: member.color, borderColor: member.color, color: "var(--color-ink-deep)" }
                : {})
            }}
          >
            <span
              style={{
                ...styles.dot,
                background: active ? "var(--color-ink-deep)" : member.color
              }}
            />
            {member.name ?? initials(member.name)}
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    background: "transparent",
    border: "1.5px solid var(--color-hairline-strong)",
    borderRadius: 999,
    padding: "9px 15px",
    minHeight: 40,
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--color-paper)",
    cursor: "pointer"
  },
  chipActiveNeutral: {
    background: "var(--color-panel-raised)",
    borderColor: "var(--color-paper)"
  },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 }
};
