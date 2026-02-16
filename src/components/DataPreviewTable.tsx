import { MeterReading } from "@/types/meter";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataPreviewTableProps {
  data: MeterReading[];
  onDataChange: (data: MeterReading[]) => void;
}

const DataPreviewTable = ({ data, onDataChange }: DataPreviewTableProps) => {
  const updateField = (id: string, field: keyof MeterReading, value: string) => {
    onDataChange(
      data.map((row) => {
        if (row.id !== id) return row;
        if (field === "loadId" || field === "physicalMeterRead" || field === "ph1Amps" || field === "ph2Amps" || field === "ph3Amps" || field === "voltage" || field === "pf") {
          return { ...row, [field]: value === "" ? null : Number(value) };
        }
        return { ...row, [field]: value };
      })
    );
  };

  const removeRow = (id: string) => {
    onDataChange(data.filter((r) => r.id !== id));
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-surface p-8">
        <p className="text-muted-foreground">No data extracted yet. Upload a document to begin.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary hover:bg-secondary">
              <TableHead className="font-semibold text-foreground w-40">Load Name</TableHead>
              <TableHead className="font-semibold text-foreground w-20">Load ID</TableHead>
              <TableHead className="font-semibold text-foreground w-28">CT Rating</TableHead>
              <TableHead className="font-semibold text-foreground w-40">Date/Time</TableHead>
              <TableHead className="font-semibold text-foreground w-32">kWh Reading</TableHead>
              <TableHead className="font-semibold text-foreground w-24">Ph1 A</TableHead>
              <TableHead className="font-semibold text-foreground w-24">Ph2 A</TableHead>
              <TableHead className="font-semibold text-foreground w-24">Ph3 A</TableHead>
              <TableHead className="font-semibold text-foreground w-24">Voltage</TableHead>
              <TableHead className="font-semibold text-foreground w-20">PF</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id} className="hover:bg-surface-elevated">
                <TableCell>
                  <Input
                    value={row.loadName}
                    onChange={(e) => updateField(row.id, "loadName", e.target.value)}
                    className="h-8 bg-card border-border font-mono text-sm"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.loadId ?? ""}
                    onChange={(e) => updateField(row.id, "loadId", e.target.value)}
                    className="h-8 bg-card border-border font-mono text-sm"
                    type="number"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.ctRating ?? ""}
                    onChange={(e) => updateField(row.id, "ctRating", e.target.value)}
                    className="h-8 bg-card border-border font-mono text-sm"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.dateTime ?? ""}
                    onChange={(e) => updateField(row.id, "dateTime", e.target.value)}
                    className="h-8 bg-card border-border font-mono text-sm"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.physicalMeterRead ?? ""}
                    onChange={(e) => updateField(row.id, "physicalMeterRead", e.target.value)}
                    className="h-8 bg-card border-border font-mono text-sm"
                    type="number"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.ph1Amps ?? ""}
                    onChange={(e) => updateField(row.id, "ph1Amps", e.target.value)}
                    className="h-8 bg-card border-border font-mono text-sm"
                    type="number"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.ph2Amps ?? ""}
                    onChange={(e) => updateField(row.id, "ph2Amps", e.target.value)}
                    className="h-8 bg-card border-border font-mono text-sm"
                    type="number"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.ph3Amps ?? ""}
                    onChange={(e) => updateField(row.id, "ph3Amps", e.target.value)}
                    className="h-8 bg-card border-border font-mono text-sm"
                    type="number"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.voltage ?? ""}
                    onChange={(e) => updateField(row.id, "voltage", e.target.value)}
                    className="h-8 bg-card border-border font-mono text-sm"
                    type="number"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.pf ?? ""}
                    onChange={(e) => updateField(row.id, "pf", e.target.value)}
                    className="h-8 bg-card border-border font-mono text-sm"
                    type="number"
                    step="0.01"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(row.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default DataPreviewTable;
