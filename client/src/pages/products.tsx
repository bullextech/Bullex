import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mountain,
  Gem,
  Flame,
  Droplets,
  Sprout,
  ChevronRight,
  Factory,
  Truck,
  Shield,
} from "lucide-react";

const divisions = [
  {
    id: "minerals",
    title: "Minerals Division",
    icon: Mountain,
    color: "from-stone-700/20 to-stone-900/10",
    accent: "text-stone-600 dark:text-stone-400",
    accentBg: "bg-stone-600/10",
    description:
      "Sourcing premium grade bulk minerals from established global mining operations for the heavy industry sector.",
    products: [
      {
        name: "Iron Ore",
        desc: "High-grade ferrous ore for steel manufacturing, available in various fines and lump specifications.",
      },
      {
        name: "Bauxite",
        desc: "Premium aluminum ore essential for alumina production, sourced from top-tier global deposits.",
      },
      {
        name: "Manganese Ore",
        desc: "Crucial alloying agent for steelmaking, offering excellent metallurgical properties.",
      },
    ],
  },
  {
    id: "metals",
    title: "Metals Division",
    icon: Gem,
    color: "from-sky-700/20 to-sky-900/10",
    accent: "text-sky-600 dark:text-sky-400",
    accentBg: "bg-sky-600/10",
    description:
      "Supplying high-purity refined metals to manufacturing, construction, and technology sectors globally.",
    products: [
      {
        name: "Copper Cathodes",
        desc: "Grade A refined copper (99.99% purity) standard LME registered, vital for electrical and industrial applications.",
      },
      {
        name: "Aluminium",
        desc: "High-quality primary aluminium ingots and alloys for diverse manufacturing requirements.",
      },
    ],
  },
  {
    id: "energy-products",
    title: "Energy Products",
    icon: Flame,
    color: "from-orange-700/20 to-orange-900/10",
    accent: "text-orange-600 dark:text-orange-400",
    accentBg: "bg-orange-600/10",
    description:
      "Delivering crucial energy products with precision logistics to power global commercial and industrial operations.",
    products: [
      {
        name: "ULSD 10ppm",
        desc: "Ultra-Low Sulfur Diesel meeting stringent environmental standards for modern transportation and industry.",
      },
      {
        name: "ULSD 50ppm",
        desc: "High-quality low sulfur diesel fuel optimized for various global market requirements.",
      },
      {
        name: "HSGO 20,000ppm",
        desc: "High Sulfur Gas Oil suitable for power generation and industrial heating applications.",
      },
      {
        name: "LPG",
        desc: "Liquefied Petroleum Gas providing clean, efficient energy for commercial and residential applications.",
      },
    ],
  },
  {
    id: "petrochemicals",
    title: "Petrochemicals",
    icon: Droplets,
    color: "from-slate-700/20 to-slate-900/10",
    accent: "text-slate-600 dark:text-slate-400",
    accentBg: "bg-slate-600/10",
    description:
      "Distributing essential chemical derivatives foundational to infrastructure development and manufacturing.",
    products: [
      {
        name: "Bitumen",
        desc: "Various penetration and performance grades critical for road construction and waterproofing.",
      },
      {
        name: "Petcoke",
        desc: "Petroleum coke utilized globally as an efficient energy source for cement and power generation.",
      },
      {
        name: "Sulphur",
        desc: "Industrial grade sulphur for fertilizer production, chemical manufacturing, and industrial processing.",
      },
    ],
  },
  {
    id: "fertilizers",
    title: "Fertilizers",
    icon: Sprout,
    color: "from-teal-700/20 to-teal-900/10",
    accent: "text-teal-700 dark:text-teal-400",
    accentBg: "bg-teal-700/10",
    description:
      "Supplying essential agricultural inputs to support global food security and sustainable farming practices.",
    products: [
      {
        name: "NPK",
        desc: "Compound fertilizer containing Nitrogen, Phosphorus, and Potassium — essential nutrients for crop growth and agricultural productivity.",
      },
    ],
  },
];

export default function Products() {
  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-3xl">
            <h1
              className="text-3xl md:text-4xl font-bold mb-4 tracking-tight"
              data-testid="text-products-title"
            >
              Commodity Divisions
            </h1>
            <div className="w-20 h-1 bg-primary-foreground/40 mb-6" />
            <p className="text-lg text-primary-foreground/80 font-light leading-relaxed">
              Our comprehensive portfolio spans five core divisions, delivering
              essential resources to industrial consumers worldwide.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 mt-8">
            {divisions.map((div) => (
              <a
                key={div.id}
                href={`#${div.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground text-xs font-medium transition-colors"
                data-testid={`link-division-${div.id}`}
              >
                <div.icon className="w-3.5 h-3.5" />
                {div.title.replace(" Division", "")}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-muted/30 py-10 px-6 border-b border-border">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-md bg-card border border-border" data-testid="stat-divisions">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Factory className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">5</p>
                <p className="text-xs text-muted-foreground">Trading Divisions</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-md bg-card border border-border" data-testid="stat-commodities">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Truck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">
                  {divisions.reduce((s, d) => s + d.products.length, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Active Commodities</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-md bg-card border border-border" data-testid="stat-blockchain">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">100%</p>
                <p className="text-xs text-muted-foreground">Blockchain Verified</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="py-12 px-6">
        <div className="max-w-5xl mx-auto space-y-20">
          {divisions.map((division, idx) => {
            const Icon = division.icon;
            const isReversed = idx % 2 === 1;

            return (
              <div
                key={division.id}
                id={division.id}
                className={`flex flex-col ${isReversed ? "md:flex-row-reverse" : "md:flex-row"} gap-8 lg:gap-12 items-start scroll-mt-24`}
                data-testid={`division-${division.id}`}
              >
                <div className="w-full md:w-2/5">
                  <div
                    className={`relative h-[280px] w-full rounded-md overflow-hidden bg-gradient-to-br ${division.color} border border-border flex flex-col items-center justify-center`}
                  >
                    <Icon className={`w-16 h-16 ${division.accent} mb-4 opacity-60`} />
                    <p className={`text-sm font-bold uppercase tracking-widest ${division.accent}`}>
                      {division.title.replace(" Division", "")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {division.products.length} product{division.products.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                <div className="w-full md:w-3/5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-md ${division.accentBg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${division.accent}`} />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">{division.title}</h2>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    {division.description}
                  </p>
                  <div className="space-y-3">
                    {division.products.map((product) => (
                      <Card
                        key={product.name}
                        className="border"
                        data-testid={`product-${product.name.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 ${division.accent}`} />
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-sm font-semibold">{product.name}</h3>
                                <Badge variant="secondary" className="text-[10px]">
                                  {division.title.replace(" Division", "")}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {product.desc}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
