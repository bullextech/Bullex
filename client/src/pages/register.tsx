import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Shield, ArrowLeft, CheckCircle2, Building2, User, Mail, Phone, Globe, Briefcase, Package, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest } from "@/lib/queryClient";

const ROLE_TYPES = [
  "Trader",
  "Buyer",
  "Seller",
  "Broker",
  "Shipping Company",
  "Quality Assessment Agency",
  "Logistics Provider",
  "Financial Institution",
  "Inspection Company",
  "Insurance Provider",
  "Legal / Compliance",
  "Other",
];

const COUNTRIES = [
  "Australia", "Bahrain", "Canada", "China", "France", "Germany", "Ghana",
  "India", "Indonesia", "Japan", "Kenya", "Malaysia", "Netherlands",
  "Nigeria", "Norway", "Oman", "Qatar", "Russia", "Saudi Arabia",
  "Singapore", "South Africa", "South Korea", "Switzerland", "Turkey",
  "Ukraine", "United Arab Emirates", "United Kingdom", "United States",
  "Vietnam", "Other",
];

const registrationSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  companyName: z.string().min(2, "Company name is required"),
  email: z.string().email("Valid email address is required"),
  phone: z.string().min(6, "Phone number is required"),
  country: z.string().min(1, "Country is required"),
  roleType: z.string().min(1, "Role type is required"),
  commodities: z.string().optional(),
  message: z.string().optional(),
});

type RegistrationForm = z.infer<typeof registrationSchema>;

export default function Register() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      fullName: "",
      companyName: "",
      email: "",
      phone: "",
      country: "",
      roleType: "",
      commodities: "",
      message: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: RegistrationForm) =>
      apiRequest("POST", "/api/register", data),
    onSuccess: () => setSubmitted(true),
  });

  const onSubmit = (data: RegistrationForm) => mutation.mutate(data);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-background px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">BULLEX</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Commodity Trading Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2" data-testid="link-back-home">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center py-12 px-4">
        <div className="w-full max-w-2xl">
          {submitted ? (
            <div className="text-center py-16 space-y-6" data-testid="registration-success">
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Registration Submitted</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Thank you for registering with Bullex. Our team will review your application and contact you shortly to guide you through the next steps, including KYC verification.
                </p>
              </div>
              <div className="bg-muted/50 border border-border rounded-lg p-4 max-w-sm mx-auto text-sm text-muted-foreground">
                A confirmation email has been sent to <strong className="text-foreground">{form.getValues("email")}</strong>.
              </div>
              <div className="flex justify-center gap-3 pt-4">
                <Link href="/">
                  <Button variant="outline" data-testid="button-go-home">Return to Home</Button>
                </Link>
                <Link href="/platform">
                  <Button data-testid="button-go-platform">Access Platform</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight" data-testid="text-register-title">Register for Bullex</h1>
                <p className="text-muted-foreground">
                  Create your account to access the Bullex Commodity Trading Platform. Complete the form below and our team will verify your details.
                </p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                    <div className="flex items-center gap-2 pb-1 border-b border-border">
                      <User className="w-4 h-4 text-primary" />
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Personal Details</h2>
                    </div>

                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John Smith" {...field} data-testid="input-full-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email Address</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input className="pl-9" placeholder="john@company.com" type="email" {...field} data-testid="input-email" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input className="pl-9" placeholder="+1 234 567 8900" {...field} data-testid="input-phone" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                    <div className="flex items-center gap-2 pb-1 border-b border-border">
                      <Building2 className="w-4 h-4 text-primary" />
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Company & Role</h2>
                    </div>

                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input className="pl-9" placeholder="Acme Trading Ltd." {...field} data-testid="input-company-name" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-country">
                                  <Globe className="w-4 h-4 text-muted-foreground mr-1" />
                                  <SelectValue placeholder="Select country" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {COUNTRIES.map((c) => (
                                  <SelectItem key={c} value={c} data-testid={`option-country-${c}`}>{c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="roleType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Role Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-role-type">
                                  <Briefcase className="w-4 h-4 text-muted-foreground mr-1" />
                                  <SelectValue placeholder="Select your role" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {ROLE_TYPES.map((r) => (
                                  <SelectItem key={r} value={r} data-testid={`option-role-${r}`}>{r}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="commodities"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Commodities of Interest <span className="text-muted-foreground text-xs font-normal">(optional)</span></FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input className="pl-9" placeholder="e.g. Coal, Crude Oil, LNG, Iron Ore..." {...field} data-testid="input-commodities" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                    <div className="flex items-center gap-2 pb-1 border-b border-border">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Additional Information</h2>
                    </div>

                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Message <span className="text-muted-foreground text-xs font-normal">(optional)</span></FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Tell us about your trading requirements, volumes, or any other relevant information..."
                              className="resize-none min-h-[100px]"
                              {...field}
                              data-testid="textarea-message"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {mutation.isError && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive" data-testid="text-error-message">
                      Something went wrong. Please try again or contact <a href="mailto:team@bullex.tech" className="underline">team@bullex.tech</a>.
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full h-12 text-sm font-bold uppercase tracking-wider"
                    disabled={mutation.isPending}
                    data-testid="button-submit-registration"
                  >
                    {mutation.isPending ? "Submitting..." : "Submit Registration"}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link href="/platform" className="text-primary hover:underline font-medium" data-testid="link-access-platform">
                      Access the Platform
                    </Link>
                  </p>
                </form>
              </Form>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-border bg-muted/30 px-4 py-3 text-center">
        <p className="text-[10px] text-muted-foreground">Bullex is a proprietary platform of Bullfrog Group. All registrations are subject to compliance review.</p>
      </footer>
    </div>
  );
}
