import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import bravegenLogo from "@/assets/bravegen-logo.svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, LogOut, Trash2, Download, Loader2, ClipboardList, Zap, Droplets, Flame, Send } from "lucide-react";
import { generateValidationExcel } from "@/lib/excelGenerator";
import { generatePulseValidationExcel, PulseValidationExportData } from "@/lib/pulseExcelGenerator";
import { SendDvDialog } from "@/components/SendDvDialog";

interface SavedValidation {
  id: string;
  name: string;
  status: string;
  settings: any;
  readings: any[];
  validation_data: any;
  comparison_data: any[];
  bravegen_raw_data: any[];
  source_image_base64: string | null;
  source_image_mime: string | null;
  created_at: string;
  updated_at: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-yellow-600/20 text-yellow-400 border-yellow-600/40",
  complete: "bg-green-600/20 text-green-400 border-green-600/40",
  exported: "bg-blue-600/20 text-blue-400 border-blue-600/40",
  submitted: "bg-purple-600/20 text-purple-400 border-purple-600/40",
};

const toolTypeLabels: Record<string, { label: string; icon: typeof Zap }> = {
  electricity: { label: "Electricity", icon: Zap },
  pulse: { label: "Pulse", icon: Droplets },
};

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [validations, setValidations] = useState<SavedValidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [sendDialogValidation, setSendDialogValidation] = useState<SavedValidation | null>(null);

  const fetchValidations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("validations")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      toast.error("Failed to load validations");
      console.error(error);
    } else {
      setValidations((data as SavedValidation[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchValidations(); }, []);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("validations").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete validation");
    } else {
      toast.success("Validation deleted");
      setValidations((prev) => prev.filter((v) => v.id !== id));
    }
  };

  const buildPulseExcelData = (v: SavedValidation): PulseValidationExportData => {
    const vd = v.validation_data || {};
    const settings = v.settings || {};
    const r1 = parseFloat(vd.firstRead?.reading || "0") || 0;
    const r2 = parseFloat(vd.secondRead?.reading || "0") || 0;
    const physicalDiff = r2 - r1;
    const hubCount = vd.accuracy ? (parseFloat(vd.overrideHubCount) || parseFloat(vd.manualHubCount) || (parseFloat(vd.manualPulseCount2 || "0") - parseFloat(vd.manualPulseCount1 || "0")) || 0) : 0;
    const factor = parseFloat(vd.overrideFactor || vd.manualFactor || "0") || 0;
    const hubVolume = hubCount * factor;
    const accuracy = vd.accuracy || (physicalDiff !== 0 ? (hubVolume / physicalDiff) * 100 : 0);

    return {
      siteInfo: {
        feed: settings.feed || "",
        serialNumber: settings.serialNumber || "",
        site: settings.site || "",
        building: settings.building || "",
      },
      mode: settings.meterMode || "water",
      validationName: v.name,
      firstRead: {
        dateTime: vd.firstRead?.dateTime || "",
        reading: vd.firstRead?.reading || "",
        imageBase64: vd.firstRead?.imageBase64 || null,
        imageMime: vd.firstRead?.imageMime || null,
      },
      secondRead: {
        dateTime: vd.secondRead?.dateTime || "",
        reading: vd.secondRead?.reading || "",
        imageBase64: vd.secondRead?.imageBase64 || null,
        imageMime: vd.secondRead?.imageMime || null,
      },
      hubCount,
      factor,
      hubVolume,
      physicalDiff,
      accuracy,
      status: vd.status || "N/A",
      comments: vd.comments || "",
      rawHubData: vd.hubRows?.length > 0
        ? vd.hubRows.map((r: any) => ({ event: r.dateFirst || "", channel: r.load || "", usage: r.hubCount || 0 }))
        : [],
    };
  };

  const handleExport = async (v: SavedValidation) => {
    try {
      const toolType = v.settings?.toolType || "electricity";
      let blob: Blob;

      if (toolType === "pulse") {
        const data = buildPulseExcelData(v);
        blob = await generatePulseValidationExcel(data);
      } else {
        blob = await generateValidationExcel(
          v.readings, v.settings, v.validation_data, v.comparison_data,
          v.bravegen_raw_data, v.source_image_base64, v.source_image_mime
        );
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DV_${v.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      await supabase.from("validations").update({ status: "exported" }).eq("id", v.id);
      setValidations((prev) => prev.map((item) => (item.id === v.id ? { ...item, status: "exported" } : item)));
      toast.success("Excel file downloaded!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export");
    }
  };

  const handleOpen = (v: SavedValidation) => {
    const toolType = v.settings?.toolType || "electricity";
    if (toolType === "pulse") {
      navigate(`/pulse-meter?validation=${v.id}`);
    } else {
      navigate(`/electricitytool?validation=${v.id}`);
    }
  };

  const getToolType = (v: SavedValidation) => v.settings?.toolType || "electricity";

  const filtered = validations.filter((v) => {
    const matchesSearch = !search || v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.settings?.siteName || "").toLowerCase().includes(search.toLowerCase()) ||
      (v.settings?.site || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={bravegenLogo} alt="BraveGen" className="h-10" />
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-foreground tracking-tight">Dashboard</h1>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowNewDialog(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Validation
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 text-muted-foreground">
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name or site..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="exported">Exported</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {validations.length === 0 ? "No saved validations yet" : "No matching validations"}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {validations.length === 0 ? "Create a new validation to get started." : "Try adjusting your search or filter."}
            </p>
            {validations.length === 0 && (
              <Button onClick={() => setShowNewDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" /> New Validation
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((v) => {
              const tt = getToolType(v);
              const ToolIcon = tt === "pulse" ? (v.settings?.meterMode === "gas" ? Flame : Droplets) : Zap;
              const modeLabel = tt === "pulse" ? (v.settings?.meterMode === "gas" ? "Gas" : "Water") : "Electricity";
              return (
                <div
                  key={v.id}
                  className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4 hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => handleOpen(v)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ToolIcon className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{v.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {modeLabel} · {(v.settings?.siteName || v.settings?.site || "")} · Updated {new Date(v.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`${statusColors[v.status] || ""} text-xs capitalize`}>{v.status}</Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); handleExport(v); }} title="Download Excel">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={e => { e.stopPropagation(); setSendDialogValidation(v); }} title="Send DV via email">
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={e => e.stopPropagation()}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Validation</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to delete "{v.name}"? This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(v.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* New Validation Type Selector */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Validation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">Choose the type of meter validation to create:</p>
          <div className="grid gap-3">
            <button
              onClick={() => { setShowNewDialog(false); navigate("/electricitytool"); }}
              className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 text-left hover:border-primary/50 transition-colors"
            >
              <div className="rounded-full bg-primary/10 p-3"><Zap className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="font-semibold text-foreground">Electricity Meter</p>
                <p className="text-xs text-muted-foreground">CT meter read sheet extraction & validation</p>
              </div>
            </button>
            <button
              onClick={() => { setShowNewDialog(false); navigate("/pulse-meter"); }}
              className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 text-left hover:border-primary/50 transition-colors"
            >
              <div className="rounded-full bg-primary/10 p-3"><Droplets className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="font-semibold text-foreground">Water Meter (Pulse)</p>
                <p className="text-xs text-muted-foreground">Pulse count validation against physical reads</p>
              </div>
            </button>
            <button
              onClick={() => { setShowNewDialog(false); navigate("/pulse-meter"); }}
              className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 text-left hover:border-primary/50 transition-colors"
            >
              <div className="rounded-full bg-primary/10 p-3"><Flame className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="font-semibold text-foreground">Gas Meter (Pulse)</p>
                <p className="text-xs text-muted-foreground">NcM pulse validation against physical reads</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send DV Dialog */}
      {sendDialogValidation && (
        <SendDvDialog
          open={!!sendDialogValidation}
          onOpenChange={(open) => { if (!open) setSendDialogValidation(null); }}
          validationName={sendDialogValidation.name}
          validationId={sendDialogValidation.id}
          onSent={() => {
            setValidations(prev => prev.map(v => v.id === sendDialogValidation.id ? { ...v, status: "submitted" } : v));
            setSendDialogValidation(null);
          }}
          generateExcel={async () => {
            const v = sendDialogValidation;
            const tt = v.settings?.toolType || "electricity";
            if (tt === "pulse") {
              return generatePulseValidationExcel(buildPulseExcelData(v));
            } else {
              return generateValidationExcel(
                v.readings, v.settings, v.validation_data, v.comparison_data,
                v.bravegen_raw_data, v.source_image_base64, v.source_image_mime
              );
            }
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
