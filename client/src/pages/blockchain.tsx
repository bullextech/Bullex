import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  CheckCircle2,
  Hash,
  Layers,
  Link2,
  PackageOpen,
  PlayCircle,
  SearchCheck,
  Shield,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import type { ReactNode } from "react";
import type {
  Block,
  BlockchainEnquirySummary,
  BlockchainKycSummary,
  BlockchainLedgerResponse,
  ProductBlockGroup,
  ProductDealBlockTrade,
} from "@shared/schema";

const dateLabel = (value: Date | string | null | undefined) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Unknown";
const money = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function HashLine({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="break-all rounded bg-muted/70 px-2 py-1.5 font-mono text-[11px] leading-relaxed">
        {value}
      </p>
    </div>
  );
}

function BlockDetails({
  block,
  trades,
  kycApps,
  enquiries,
}: {
  block: Block;
  trades: ProductDealBlockTrade[];
  kycApps: BlockchainKycSummary[];
  enquiries: BlockchainEnquirySummary[];
}) {
  const isKyc = block.dataType === "kyc";
  const isAmendment = block.dataType === "kyc_amendment";
  const isEnquiry = block.dataType === "trade_enquiry";
  const isEnquiryAmendment = block.dataType === "enquiry_amendment";
  const relatedTrades =
    isKyc || isAmendment || isEnquiry || isEnquiryAmendment
      ? []
      : trades.filter((trade) => trade.blockNumber === block.blockNumber);
  const kyc =
    (isKyc || isAmendment) && block.dataId
      ? kycApps.find((item) => item.id === block.dataId)
      : null;
  const enquiry =
    (isEnquiry || isEnquiryAmendment) && block.dataId
      ? enquiries.find((item) => item.id === block.dataId)
      : null;
  const type = isAmendment
    ? "KYC Amendment"
    : isEnquiryAmendment
      ? "Enquiry Amendment"
      : isKyc
        ? "KYC Verification"
        : isEnquiry
          ? "Trade Enquiry"
          : "Trade";
  return (
    <div className="space-y-4 border-t bg-muted/20 px-4 pb-4 pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <HashLine
          label="Block hash"
          value={block.hash}
          icon={<Hash className="h-3 w-3" />}
        />
        <HashLine
          label="Previous hash"
          value={block.previousHash}
          icon={<ArrowRight className="h-3 w-3" />}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
        <div>
          <span className="text-muted-foreground">Type</span>
          <p className="font-medium">{type}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Nonce</span>
          <p className="font-mono font-medium">{block.nonce}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Timestamp</span>
          <p className="font-medium">{dateLabel(block.timestamp)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Transactions</span>
          <p className="font-medium">{block.tradeCount}</p>
        </div>
      </div>
      {kyc && (
        <div
          className="rounded border border-chart-2/20 bg-chart-2/5 p-3 text-xs"
          data-testid={`block-kyc-${kyc.id}`}
        >
          <p className="mb-2 flex items-center gap-1 font-semibold">
            <Users className="h-3.5 w-3.5" />{" "}
            {isAmendment ? "KYC Amendment Record" : "KYC Record"}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{kyc.companyName}</span>
            <Badge variant="secondary">
              {isAmendment ? "Amended" : "Approved"}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {kyc.countryOfIncorporation} · Reg: {kyc.registrationNumber}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Category</span>
              <p className="font-medium">{kyc.category || "N/A"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Products</span>
              <p className="font-medium">{kyc.products || "N/A"}</p>
            </div>
          </div>
          {isAmendment && block.dataSummary && (
            <div className="mt-2">
              <span className="text-muted-foreground">Changed fields</span>
              <p className="mt-1 rounded bg-background p-1.5 font-medium">
                {block.dataSummary.split("Amendment: ")[1] || block.dataSummary}
              </p>
            </div>
          )}
          {kyc.blockchainHash && (
            <div className="mt-2">
              <span className="text-muted-foreground">KYC blockchain hash</span>
              <p className="mt-1 break-all rounded bg-background p-1.5 font-mono text-[11px]">
                {kyc.blockchainHash}
              </p>
            </div>
          )}
        </div>
      )}
      {enquiry && (
        <div
          className="rounded border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs"
          data-testid={`block-enquiry-${enquiry.id}`}
        >
          <p className="mb-2 flex items-center gap-1 font-semibold">
            <SearchCheck className="h-3.5 w-3.5" /> Accepted Trade Enquiry
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">
                {enquiry.enquiryRef}
              </span>
              <Badge
                className={`text-[10px] text-white ${enquiry.side === "sell" ? "bg-red-600" : "bg-green-600"}`}
              >
                {enquiry.side === "sell" ? "SELL" : "BUY"}
              </Badge>
            </div>
            <Badge className="bg-emerald-600 text-white">Accepted</Badge>
          </div>
          <div className="mt-2 grid gap-2 text-muted-foreground sm:grid-cols-2">
            <div>
              <span className="text-[10px] uppercase tracking-wider">
                Product
              </span>
              <p className="font-medium text-foreground">{enquiry.product}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider">
                Quantity
              </span>
              <p className="font-medium text-foreground">
                {enquiry.quantity || "—"} {enquiry.unit || "MT"}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider">
                Created by
              </span>
              <p className="font-medium text-foreground">
                {enquiry.createdBy || "—"}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider">
                Accepted by
              </span>
              <p className="font-medium text-foreground">
                {enquiry.clientRespondedBy || "—"}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider">
                Loading port
              </span>
              <p className="font-medium text-foreground">
                {enquiry.loadingPort || "—"}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider">
                Incoterms
              </span>
              <p className="font-medium text-foreground">
                {enquiry.incoterms || "—"}
              </p>
            </div>
          </div>
          <Link
            href={`/trading?enquiry=${enquiry.id}`}
            className="mt-3 flex h-8 w-full items-center justify-center rounded-md bg-emerald-600 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
            data-testid={`button-initiate-trade-${enquiry.id}`}
          >
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
            Initiate Trade
          </Link>
        </div>
      )}
      {relatedTrades.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Transactions in block</p>
          {relatedTrades.map((trade) => (
            <div
              key={trade.id}
              className="rounded border bg-card p-2.5 text-xs"
              data-testid={`block-trade-${trade.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">
                    {trade.tradeRef}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {trade.commodityCategory}
                  </Badge>
                </div>
                <span className="font-mono font-medium">
                  {money(trade.totalValue, trade.currency)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-2 text-muted-foreground">
                <span>
                  {trade.commodity} · {trade.quantity} {trade.unit}
                </span>
                <span>
                  {trade.origin} → {trade.destination}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RawBlock({
  block,
  trades,
  kycApps,
  enquiries,
}: {
  block: Block;
  trades: ProductDealBlockTrade[];
  kycApps: BlockchainKycSummary[];
  enquiries: BlockchainEnquirySummary[];
}) {
  const special =
    block.dataType === "kyc" || block.dataType === "kyc_amendment"
      ? "KYC"
      : block.dataType === "trade_enquiry" ||
          block.dataType === "enquiry_amendment"
        ? "Enquiry"
        : "Trade";
  return (
    <AccordionItem
      value={block.id}
      className="mb-2 overflow-hidden rounded-md border bg-card"
      data-testid={`block-${block.blockNumber}`}
    >
      <AccordionTrigger className="px-3 py-3 hover:no-underline sm:px-4">
        <div className="flex min-w-0 items-center gap-3 text-left">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary/10">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm">
                Block #{block.blockNumber}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {special}
              </Badge>
              {block.verified && (
                <Badge className="bg-status-online text-[10px] text-white">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Verified
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {block.dataSummary ||
                `${block.tradeCount} transaction${block.tradeCount === 1 ? "" : "s"}`}{" "}
              · {dateLabel(block.timestamp)}
            </p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="p-0">
        <BlockDetails
          block={block}
          trades={trades}
          kycApps={kycApps}
          enquiries={enquiries}
        />
      </AccordionContent>
    </AccordionItem>
  );
}

function DealChild({
  child,
}: {
  child: ProductBlockGroup["dealBlocks"][number];
}) {
  const { trade, block } = child;
  const ref = child.dealRef || trade.tradeRef;
  return (
    <AccordionItem
      value={child.associationId}
      className="overflow-hidden border-b last:border-b-0"
      data-testid={`product-deal-${child.associationId}`}
    >
      <AccordionTrigger className="px-3 py-3 hover:bg-muted/30 hover:no-underline sm:px-4">
        <div className="grid w-full min-w-0 gap-2 text-left lg:grid-cols-[minmax(150px,1.2fr)_minmax(120px,1fr)_110px_140px] lg:items-center lg:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-sm font-semibold">
                {ref}
              </span>
              {child.dealRef && (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  Deal
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Trade {trade.tradeRef} · Block #{block.blockNumber}
            </p>
          </div>
          <div className="text-xs">
            <p className="truncate font-medium">
              {trade.quantity} {trade.unit} {trade.commodity}
            </p>
            <p className="text-muted-foreground">
              {trade.origin} → {trade.destination}
            </p>
          </div>
          <div>
            <Badge variant="outline" className="text-[10px] capitalize">
              {trade.status.replace(/_/g, " ")}
            </Badge>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {dateLabel(block.timestamp)}
            </p>
          </div>
          <div className="text-xs lg:text-right">
            <p className="font-mono font-medium">
              {money(trade.totalValue, trade.currency)}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-status-online lg:justify-end">
              <Shield className="h-3 w-3" />
              {block.verified ? "Verified proof" : "Unverified"}
            </p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="border-t bg-muted/20 px-3 pb-4 pt-4 sm:px-4">
        <div className="grid gap-3 text-xs sm:grid-cols-4">
          <div>
            <span className="text-muted-foreground">Commercial summary</span>
            <p className="font-medium">
              {trade.quantity} {trade.unit} at{" "}
              {money(trade.pricePerUnit, trade.currency)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Route</span>
            <p className="font-medium">
              {trade.origin} → {trade.destination}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Verification</span>
            <p className="font-medium">
              {block.verified ? "Chain verified" : "Review required"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Association</span>
            <p className="truncate font-mono" title={child.associationId}>
              {child.associationId}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <span className="text-muted-foreground">Block number</span>
            <p className="font-mono font-medium">#{block.blockNumber}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Nonce</span>
            <p className="font-mono font-medium">{block.nonce}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Timestamp</span>
            <p className="font-medium">{dateLabel(block.timestamp)}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <HashLine
            label="Block hash"
            value={block.hash}
            icon={<Hash className="h-3 w-3" />}
          />
          <HashLine
            label="Previous hash"
            value={block.previousHash}
            icon={<ArrowRight className="h-3 w-3" />}
          />
          {trade.blockchainHash && (
            <HashLine
              label="Trade blockchain hash"
              value={trade.blockchainHash}
              icon={<Hash className="h-3 w-3" />}
            />
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function ProductExplorer({ groups }: { groups: ProductBlockGroup[] }) {
  return (
    <Card
      data-testid="card-product-blocks"
      className="overflow-hidden border-primary/20"
    >
      <CardHeader className="border-b bg-primary/[0.03] px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageOpen className="h-4 w-4 text-primary" />
            Deal reference blocks
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {groups.length} commodities
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Logical product parents organize immutable deal associations without
          changing the chronological chain.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {groups.length ? (
          <Accordion type="multiple">
            {groups.map((group) => (
              <AccordionItem
                key={group.parent.id}
                value={group.parent.id}
                className="border-b last:border-0"
                data-testid={`product-parent-${group.parent.id}`}
              >
                <AccordionTrigger className="px-4 py-4 hover:bg-muted/30 hover:no-underline sm:px-5">
                  <div className="flex min-w-0 items-center gap-3 text-left">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent/10">
                      <PackageOpen className="h-4 w-4 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {group.parent.commodityLabel}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {group.dealBlocks.length} deal{" "}
                          {group.dealBlocks.length === 1 ? "block" : "blocks"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Parent key {group.parent.commodityKey} · created{" "}
                        {dateLabel(group.parent.createdAt)}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="border-t bg-muted/10 p-0">
                  <Accordion type="single" collapsible>
                    {group.dealBlocks.map((child) => (
                      <DealChild key={child.associationId} child={child} />
                    ))}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            <PackageOpen className="mx-auto mb-2 h-8 w-8 opacity-30" />
            No product deal associations yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Blockchain() {
  const { data: ledger, isLoading } = useQuery<BlockchainLedgerResponse>({
    queryKey: ["/api/blockchain-ledger"],
  });
  if (isLoading)
    return (
      <div className="space-y-5 p-4 sm:p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-[420px]" />
      </div>
    );
  const allBlocks = ledger?.blocks || [],
    verified = allBlocks.filter((block) => block.verified).length;
  const transactions = allBlocks.reduce(
    (sum, block) => sum + block.tradeCount,
    0,
  );
  return (
    <div className="h-full space-y-5 overflow-y-auto p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            Operations / Cryptographic ledger
          </p>
          <h1
            className="text-2xl font-bold tracking-tight"
            data-testid="text-blockchain-title"
          >
            Bullex Blockchain Ledger
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan deal provenance, then open the raw chain when you need the
            complete audit trail.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-status-online" />
          Live ledger view
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="bullex-stat-card" data-testid="stat-total-blocks">
          <CardContent className="flex items-center gap-3 pt-5">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Total blocks</p>
              <p className="text-xl font-bold">{allBlocks.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bullex-stat-card" data-testid="stat-total-txns">
          <CardContent className="flex items-center gap-3 pt-5">
            <Link2 className="h-5 w-5 text-chart-2" />
            <div>
              <p className="text-xs text-muted-foreground">Transactions</p>
              <p className="text-xl font-bold">{transactions}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bullex-stat-card" data-testid="stat-chain-integrity">
          <CardContent className="flex items-center gap-3 pt-5">
            <Shield className="h-5 w-5 text-status-online" />
            <div>
              <p className="text-xs text-muted-foreground">Chain integrity</p>
              <p className="text-xl font-bold">
                {allBlocks.length
                  ? `${Math.round((verified / allBlocks.length) * 100)}% Valid`
                  : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <ProductExplorer groups={ledger?.productGroups || []} />
      <Card data-testid="card-blockchain">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 sm:px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            Raw chronological chain
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {allBlocks.length} blocks
          </Badge>
        </CardHeader>
        <CardContent className="px-3 pb-4 sm:px-5">
          {allBlocks.length ? (
            <Accordion type="single" collapsible>
              {allBlocks.map((block) => (
                <RawBlock
                  key={block.id}
                  block={block}
                  trades={ledger?.trades || []}
                  kycApps={ledger?.kycApps || []}
                  enquiries={ledger?.enquiries || []}
                />
              ))}
            </Accordion>
          ) : (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <Link2 className="mx-auto mb-3 h-10 w-10 opacity-20" />
              No blocks mined yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
