import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Mail,
  Phone,
  Clock,
  Shield,
  Globe,
  Building2,
} from "lucide-react";

export default function Contact() {
  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-3xl">
            <Badge
              variant="secondary"
              className="text-[10px] uppercase tracking-widest bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 mb-4"
            >
              Bullex
            </Badge>
            <h1
              className="text-3xl md:text-4xl font-bold mb-4 tracking-tight"
              data-testid="text-contact-title"
            >
              Contact Us
            </h1>
            <div className="w-20 h-1 bg-primary-foreground/40 mb-6" />
            <p className="text-lg text-primary-foreground/80 font-light leading-relaxed">
              Get in touch with the Bullex team for product inquiries,
              investor onboarding, and partnership opportunities.
            </p>
          </div>
        </div>
      </div>

      <div className="py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
            <Card className="border" data-testid="card-contact-location">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-sm font-semibold mb-1">Location</h3>
                <p className="text-sm text-muted-foreground" data-testid="text-location">
                  Dubai
                </p>
              </CardContent>
            </Card>

            <Card className="border" data-testid="card-contact-email">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-sm font-semibold mb-1">Email</h3>
                <a
                  href="mailto:team@bullex.tech"
                  className="text-sm text-primary hover:underline"
                  data-testid="link-email"
                >
                  team@bullex.tech
                </a>
              </CardContent>
            </Card>

            <Card className="border" data-testid="card-contact-phone">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Phone className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-sm font-semibold mb-1">Phone</h3>
                <a
                  href="tel:+971585416399"
                  className="text-sm text-primary hover:underline"
                  data-testid="link-phone"
                >
                  +971 585 416 399
                </a>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h2 className="text-xl font-bold tracking-tight mb-4" data-testid="text-about-office">
                Dubai Office
              </h2>
              <div className="w-12 h-0.5 bg-primary mb-6" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Our Dubai headquarters serves as the central hub for Bullex trading
                operations, managing commodity trading across Asia, the Middle East,
                and Africa. From this strategic location, we oversee the full trade
                lifecycle — from commodity verification and KYC onboarding to blockchain-backed
                trade execution and settlement.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Headquarters</p>
                    <p className="text-xs text-muted-foreground">Dubai, United Arab Emirates</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Globe className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Operating Regions</p>
                    <p className="text-xs text-muted-foreground">Asia, Middle East, Africa</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Business Hours</p>
                    <p className="text-xs text-muted-foreground">Sunday – Thursday, 9:00 AM – 6:00 PM (GST)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Shield className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Platform</p>
                    <p className="text-xs text-muted-foreground">Bullex — Trading of Real-World Commodities</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight mb-4">
                Inquiry Types
              </h2>
              <div className="w-12 h-0.5 bg-primary mb-6" />
              <div className="space-y-3">
                {[
                  {
                    title: "Investor Onboarding",
                    desc: "New investor registration, institutional KYC submission, and account verification for token acquisition.",
                  },
                  {
                    title: "Product Inquiries",
                    desc: "Commodity sourcing, pricing, specifications, and availability across all trading divisions.",
                  },
                  {
                    title: "Commodity Divisions",
                    desc: "Inquiries about tokenised commodities across Minerals, Metals, Energy Products, Petrochemicals, and Fertilizers.",
                  },
                  {
                    title: "Documentation & Compliance",
                    desc: "Trade document requests, KYC/AML compliance, and regulatory alignment inquiries.",
                  },
                  {
                    title: "Partnerships",
                    desc: "Strategic partnerships, joint ventures, and institutional collaboration opportunities.",
                  },
                ].map((item) => (
                  <Card key={item.title} className="border" data-testid={`card-inquiry-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                    <CardContent className="p-4">
                      <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {item.desc}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-t border-border py-10 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-sm text-muted-foreground mb-2">
            For urgent trading matters, contact us directly at
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:team@bullex.tech"
              className="text-sm font-medium text-primary hover:underline flex items-center gap-1.5"
              data-testid="link-footer-email"
            >
              <Mail className="w-3.5 h-3.5" />
              team@bullex.tech
            </a>
            <span className="text-muted-foreground">|</span>
            <a
              href="tel:+971585416399"
              className="text-sm font-medium text-primary hover:underline flex items-center gap-1.5"
              data-testid="link-footer-phone"
            >
              <Phone className="w-3.5 h-3.5" />
              +971 585 416 399
            </a>
          </div>
          <p className="text-[10px] text-muted-foreground mt-6">
            Bullex — Trading of Real-World Commodities — All Rights Reserved
          </p>
        </div>
      </div>
    </div>
  );
}
