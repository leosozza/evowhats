
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus, Mail, Lock, User, Chrome, AlertCircle } from "lucide-react";

const AuthPanel = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha e-mail e senha.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    console.log("[auth] Attempting login for:", loginEmail);
    
    try {
      // Verificar conectividade com Supabase
      console.log("[auth] Testing Supabase connection...");
      
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) {
        console.error("[auth] Login error details:", {
          message: error.message,
          status: error.status,
          statusText: error.name,
        });
        
        // Tratamento específico de erros
        let errorMessage = "Verifique suas credenciais.";
        
        if (error.message.includes("Load failed") || error.message.includes("Failed to fetch")) {
          errorMessage = "Problema de conectividade. Verifique sua conexão com a internet.";
        } else if (error.message.includes("Invalid login credentials")) {
          errorMessage = "E-mail ou senha incorretos.";
        } else if (error.message.includes("Email not confirmed")) {
          errorMessage = "Por favor, confirme seu e-mail antes de fazer login.";
        } else if (error.message.includes("Too many requests")) {
          errorMessage = "Muitas tentativas. Tente novamente em alguns minutos.";
        }
        
        throw new Error(errorMessage);
      }

      toast({ 
        title: "Login realizado!", 
        description: "Bem-vindo de volta." 
      });
      
    } catch (error: any) {
      console.error("[auth] Login error:", error);
      toast({
        title: "Erro ao entrar",
        description: error.message || "Erro desconhecido. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!signupEmail.trim() || !signupPassword || !fullName.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha todos os campos.",
        variant: "destructive",
      });
      return;
    }

    if (signupPassword.length < 6) {
      toast({
        title: "Senha muito curta",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    console.log("[auth] Attempting signup for:", signupEmail);
    
    try {
      const { error } = await supabase.auth.signUp({
        email: signupEmail.trim(),
        password: signupPassword,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/`
        },
      });

      if (error) {
        console.error("[auth] Signup error details:", {
          message: error.message,
          status: error.status,
          statusText: error.name,
        });

        let errorMessage = "Tente novamente mais tarde.";
        
        if (error.message.includes("Load failed") || error.message.includes("Failed to fetch")) {
          errorMessage = "Problema de conectividade. Verifique sua conexão com a internet.";
        } else if (error.message.includes("User already registered")) {
          errorMessage = "Este e-mail já está cadastrado. Tente fazer login.";
        } else if (error.message.includes("Password should be at least")) {
          errorMessage = "A senha deve ter pelo menos 6 caracteres.";
        }
        
        throw new Error(errorMessage);
      }

      toast({
        title: "Cadastro criado!",
        description: "Verifique seu e-mail para confirmar sua conta.",
      });
      
      // Limpar campos após sucesso
      setSignupEmail("");
      setSignupPassword("");
      setFullName("");
      
    } catch (error: any) {
      console.error("[auth] Signup error:", error);
      toast({
        title: "Erro ao cadastrar",
        description: error.message || "Erro desconhecido. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    console.log("[auth] Google OAuth starting...");
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      
      if (error) {
        console.error("[auth] Google OAuth error:", error);
        throw error;
      }
      
    } catch (error: any) {
      console.error("[auth] Google OAuth error:", error);
      toast({
        title: "Erro ao entrar com Google",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    console.log("[auth] Testing Supabase connection...");
    try {
      const { data, error } = await supabase.from("user_configurations").select("count").limit(1);
      console.log("[auth] Connection test result:", { data, error });
      
      if (error) {
        toast({
          title: "Erro de conectividade",
          description: "Não foi possível conectar ao servidor.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Conexão OK",
          description: "Servidor está acessível.",
        });
      }
    } catch (error) {
      console.error("[auth] Connection test failed:", error);
      toast({
        title: "Erro de rede",
        description: "Verifique sua conexão com a internet.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Autenticação</h2>
          <p className="text-sm text-muted-foreground">
            Entre ou crie sua conta para acessar suas configurações.
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={testConnection}
          className="flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4" />
          Testar Conexão
        </Button>
      </div>

      <Tabs defaultValue="login" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="login">Entrar</TabsTrigger>
          <TabsTrigger value="signup">Criar conta</TabsTrigger>
        </TabsList>

        <TabsContent value="login" className="mt-6 space-y-4">
          <div>
            <Label htmlFor="login-email">E-mail</Label>
            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="login-email"
                type="email"
                placeholder="seu@email.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="pl-9"
                disabled={loading}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="login-password">Senha</Label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="login-password"
                type="password"
                placeholder="Sua senha"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="pl-9"
                disabled={loading}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleLogin} 
              disabled={loading} 
              className="gradient-primary w-full"
            >
              <LogIn className="h-4 w-4 mr-2" />
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleGoogle} 
              disabled={loading} 
              className="w-full"
            >
              <Chrome className="h-4 w-4 mr-2" />
              Google
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="signup" className="mt-6 space-y-4">
          <div>
            <Label htmlFor="signup-name">Nome completo</Label>
            <div className="relative">
              <User className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="signup-name"
                placeholder="Seu nome"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="pl-9"
                disabled={loading}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="signup-email">E-mail</Label>
            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="signup-email"
                type="email"
                placeholder="seu@email.com"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className="pl-9"
                disabled={loading}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="signup-password">Senha</Label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="signup-password"
                type="password"
                placeholder="Crie uma senha (mín. 6 caracteres)"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="pl-9"
                disabled={loading}
              />
            </div>
          </div>
          <Button 
            onClick={handleSignup} 
            disabled={loading} 
            className="gradient-accent w-full"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            {loading ? "Criando..." : "Criar conta"}
          </Button>
        </TabsContent>
      </Tabs>
    </Card>
  );
};

export default AuthPanel;
