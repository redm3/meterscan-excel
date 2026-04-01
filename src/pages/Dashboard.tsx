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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Search, LogOut, FileText, Trash2, Download, Loader2, ClipboardList } from "lucide-react";
import { generateValidationExcel } from "@/lib/excelGenerator";

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
};

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [validations, setValidations] = useState<SavedValidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  useEffect(() => {
    fetchValidations();
  }, []);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("validations").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete validation");
    } else {
      toast.success("Validation deleted");
      setValidations((prev) => prev.filter((v) => v.id !== id));
    }
  };

  const handleExport = async (v: SavedValidation) => {
    try {
      const blob = await generateValidationExcel(
        v.readings,
        v.settings,
        v.validation_data,
        v.comparison_data,
        v.bravegen_raw_data,
        v.source_image_base64,
        v.source_image_mime
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const datePart = new Date().toISOString().slice(0, 10);
      a.download = `Validation_${v.name.replace(/\s+/g, "_")}_${datePart}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      // Update status to exported
      await supabase.from("validations").update({ status: "exported" }).eq("id", v.id);
      setValidations((prev) =>
        prev.map((item) => (item.id === v.id ? { ...item, status: "exported" } : item))
      );
      toast.success("Excel file downloaded!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export");
    }
  };

  const handleOpen = (id: string) => {
    navigate(`/?validation=${id}`);
  };

  const filtered = validations.filter((v) => {
    const matchesSearch =
      !search ||
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.settings?.siteName || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={bravegenLogo} alt="BraveGen" className="h-10" />
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-foreground tracking-tight">Dashboard</h1>
              <p className="text-xs text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/")} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Validation
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 text-muted-foreground">
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or site..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="exported">Exported</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
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
              {validations.length === 0
                ? "Create a new validation to get started. Your work will be saved here."
                : "Try adjusting your search or filter."}
            </p>
            {validations.length === 0 && (
              <Button onClick={() => navigate("/")} className="gap-2">
                <Plus className="h-4 w-4" />
                New Validation
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4 hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => handleOpen(v.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{v.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.settings?.siteName && `${v.settings.siteName} · `}
                      {v.readings?.length || 0} readings · Updated {new Date(v.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={`${statusColors[v.status] || ""} text-xs capitalize`}>
                    {v.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport(v);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Validation</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{v.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(v.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
