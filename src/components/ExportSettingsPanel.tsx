import { ExportSettings } from "@/types/meter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ExportSettingsPanelProps {
  settings: ExportSettings;
  onChange: (settings: ExportSettings) => void;
}

const ExportSettingsPanel = ({ settings, onChange }: ExportSettingsPanelProps) => {
  const update = (field: keyof ExportSettings, value: string) => {
    onChange({ ...settings, [field]: value });
  };

  const fields: { key: keyof ExportSettings; label: string }[] = [
    { key: "siteName", label: "Site Name" },
    { key: "buildingName", label: "Building" },
    { key: "feedName", label: "Feed" },
    { key: "serialNumber", label: "Serial Number" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-surface p-4 md:grid-cols-4">
      {fields.map(({ key, label }) => (
        <div key={key} className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <Input
            value={settings[key]}
            onChange={(e) => update(key, e.target.value)}
            placeholder={label}
            className="h-9 bg-card border-border font-mono text-sm"
          />
        </div>
      ))}
    </div>
  );
};

export default ExportSettingsPanel;
