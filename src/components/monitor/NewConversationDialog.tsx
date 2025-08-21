
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, MessageSquare } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { createConversation } from "@/services/chatApi";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

interface NewConversationDialogProps {
  onConversationCreated: () => void;
}

export default function NewConversationDialog({ onConversationCreated }: NewConversationDialogProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { session } = useSupabaseAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user || !phone.trim()) return;

    setLoading(true);
    try {
      const cleanPhone = phone.replace(/\D/g, ""); // Remove non-digits
      
      await createConversation({
        userId: session.user.id,
        contact_phone: cleanPhone,
        contact_name: name.trim() || undefined,
      });

      toast({
        title: "Conversa criada",
        description: `Nova conversa iniciada com ${name || cleanPhone}`,
      });

      setPhone("");
      setName("");
      setOpen(false);
      onConversationCreated();
    } catch (error: any) {
      console.error("Erro ao criar conversa:", error);
      toast({
        title: "Erro ao criar conversa",
        description: error.message || "Falha ao iniciar nova conversa",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Conversa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Iniciar Nova Conversa
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Número do WhatsApp *</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="5511999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Digite o número completo com código do país (ex: 5511999999999)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Contato (opcional)</Label>
            <Input
              id="name"
              type="text"
              placeholder="Nome do contato"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !phone.trim()}>
              {loading ? "Criando..." : "Iniciar Conversa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
