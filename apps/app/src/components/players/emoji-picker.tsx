export const EMOJI_OPTIONS = [
  "😎", "🦁", "🐯", "🦊", "🐻", "🐸", "🦄", "🐙",
  "🎃", "👻", "🤖", "👽", "🧙", "🧛", "🥷", "🏄",
  "⚡", "🌟", "🔥", "💎", "🎯", "🏆", "🎸", "🎭",
];

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-2">Elige avatar</p>
      <div className="grid grid-cols-8 gap-1">
        {EMOJI_OPTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onChange(e)}
            className={`size-10 text-xl rounded-lg flex items-center justify-center transition-colors ${
              value === e
                ? "bg-primary/20 ring-2 ring-primary"
                : "hover:bg-muted"
            }`}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
