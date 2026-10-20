// Default procurement checklist head — a general Buyer's Document Procurement
// Checklist applicable to any commodity (adapted from the uploaded Sulphur
// procurement checklist). Seeded idempotently (by name) the first time the
// checklist templates are listed.
import type { InsertChecklistTemplate } from "@shared/schema";

export const DEFAULT_CHECKLIST_TEMPLATE: InsertChecklistTemplate = {
  name: "Buyer's Document Procurement Checklist",
  description: "General document procurement checklist for physical commodity purchases",
  objective:
    "Ensure the supplier has the legal authority, product ownership, export capability, and documentary compliance before issuing any financial instrument (LC/BG) or making payment.",
  stages: [
    {
      title: "Stage 1 – Supplier Due Diligence (Before Negotiations)",
      items: [
        { label: "Certificate of Incorporation", purpose: "Verify legal existence" },
        { label: "Business / Company Registration Number", purpose: "Company registration verification" },
        { label: "Tax Registration Certificate", purpose: "Tax compliance" },
        { label: "Company Charter / Articles of Association", purpose: "Corporate authority" },
        { label: "Shareholding Structure", purpose: "Identify beneficial ownership" },
        { label: "Director's Passport / ID", purpose: "Identity verification" },
        { label: "Board Resolution authorizing transaction", purpose: "Signing authority" },
        { label: "Power of Attorney (if applicable)", purpose: "Verify signatory authority" },
        { label: "Registered Office Address", purpose: "Physical verification" },
        { label: "Company Profile", purpose: "Business capability assessment" },
      ],
      actions: [
        "Verify registration with the authorities of the supplier's country.",
        "Conduct sanctions, AML, and adverse media screening.",
        "Confirm the supplier's bank account belongs to the legal entity.",
      ],
    },
    {
      title: "Stage 2 – Commercial Verification",
      items: [
        { label: "Full Corporate Offer (FCO)", purpose: "Commercial terms" },
        { label: "Product Specification Sheet", purpose: "Technical specifications" },
        { label: "Price Confirmation", purpose: "Commercial verification" },
        { label: "Quantity Allocation Letter", purpose: "Confirm available quantity" },
        { label: "Delivery Schedule", purpose: "Shipment planning" },
      ],
      actions: [
        "Verify origin.",
        "Verify Incoterms.",
        "Confirm payment terms.",
        "Confirm shipment schedule.",
      ],
    },
    {
      title: "Stage 3 – Product Ownership Verification",
      items: [
        { label: "Producer Supply Agreement", purpose: "Confirm sourcing" },
        { label: "Purchase Contract", purpose: "Ownership verification" },
        { label: "Warehouse Receipt", purpose: "Stock evidence" },
        { label: "Warehouse Storage Agreement", purpose: "Storage rights" },
        { label: "Stock Inventory Report", purpose: "Available inventory" },
        { label: "Warehouse Release Authorization", purpose: "Right to remove goods" },
      ],
      actions: [
        "Verify actual ownership.",
        "Ensure goods are free from liens or pledges.",
        "Confirm sufficient stock.",
      ],
    },
    {
      title: "Stage 4 – Warehouse / Storage Verification",
      items: [
        { label: "Warehouse Operator Confirmation", purpose: "Confirm storage" },
        { label: "Stock Report", purpose: "Inventory verification" },
        { label: "Warehouse Location Details", purpose: "Site confirmation" },
        { label: "Storage Charges Status", purpose: "Ensure no outstanding dues" },
        { label: "Warehouse Insurance", purpose: "Risk assessment" },
      ],
      actions: [
        "Conduct physical inspection or appoint an independent surveyor.",
        "Match stock quantity with contract quantity.",
      ],
    },
    {
      title: "Stage 5 – Product Quality Verification",
      items: [
        { label: "Certificate of Analysis (COA)", purpose: "Product quality" },
        { label: "Quality Certificate", purpose: "Compliance" },
        { label: "SGS/Bureau Veritas/Intertek Report", purpose: "Independent verification" },
        { label: "Quality Parameter Test Reports", purpose: "Contractual quality parameters" },
        { label: "Product Conformity Report", purpose: "Product conformity" },
      ],
      actions: [
        "Compare test results against contractual specifications.",
        "Request fresh testing if the reports are outdated.",
      ],
    },
    {
      title: "Stage 6 – Export Compliance",
      items: [
        { label: "Export Registration", purpose: "Export eligibility" },
        { label: "Export Permit (if applicable)", purpose: "Regulatory compliance" },
        { label: "Customs Registration", purpose: "Export capability" },
        { label: "HS Code Confirmation", purpose: "Customs classification" },
        { label: "Export Compliance Declaration", purpose: "Legal compliance" },
      ],
      actions: [
        "Confirm the supplier is legally permitted to export.",
        "Verify no export restrictions apply.",
      ],
    },
    {
      title: "Stage 7 – Contract Execution",
      items: [
        { label: "Signed Sale & Purchase Agreement (SPA)", purpose: "Binding contract" },
        { label: "Technical Specifications Annex", purpose: "Product definition" },
        { label: "Inspection Procedure", purpose: "Quality control" },
        { label: "Delivery Schedule", purpose: "Logistics" },
        { label: "Payment Terms Annex", purpose: "Trade finance" },
      ],
      actions: [
        "Ensure all annexures are signed.",
        "Confirm governing law and dispute resolution clauses.",
      ],
    },
    {
      title: "Stage 8 – Pre-Shipment Documents",
      items: [
        { label: "Loading / Transport Schedule", purpose: "Transport planning" },
        { label: "Transport Allocation (wagons / trucks / vessel space)", purpose: "Logistics" },
        { label: "Weighbridge / Weight Certificates", purpose: "Quantity verification" },
        { label: "Pre-Shipment Inspection Certificate", purpose: "Independent inspection" },
        { label: "Draft Commercial Invoice", purpose: "Payment preparation" },
        { label: "Draft Packing List", purpose: "Shipment details" },
      ],
      actions: [
        "Verify quantities loaded.",
        "Approve pre-shipment inspection results.",
      ],
    },
    {
      title: "Stage 9 – Export Customs",
      items: [
        { label: "Export Customs Declaration", purpose: "Export clearance" },
        { label: "Customs Release", purpose: "Customs approval" },
        { label: "Certificate of Origin", purpose: "Preferential/import requirements" },
        { label: "Export Invoice", purpose: "Commercial document" },
        { label: "Packing List", purpose: "Shipment details" },
      ],
      actions: [
        "Verify exporter details match the SPA.",
        "Confirm quantities and HS code.",
      ],
    },
    {
      title: "Stage 10 – Shipment Documents",
      items: [
        { label: "Original Bill of Lading / Transport Document", purpose: "Title document" },
        { label: "Commercial Invoice", purpose: "Payment" },
        { label: "Packing List", purpose: "Cargo details" },
        { label: "Certificate of Origin", purpose: "Import customs" },
        { label: "Final Inspection Certificate", purpose: "Quality confirmation" },
        { label: "Weight Certificate", purpose: "Quantity confirmation" },
        { label: "Insurance Certificate (CIF/CIP)", purpose: "Cargo insurance" },
      ],
      actions: [
        "Check consistency across all shipping documents.",
        "Ensure document presentation complies with the Letter of Credit.",
      ],
    },
    {
      title: "Stage 11 – Payment & Banking",
      items: [
        { label: "Bank Account Confirmation", purpose: "Payment security" },
        { label: "SWIFT Details", purpose: "Funds transfer" },
        { label: "Beneficiary Declaration", purpose: "Bank verification" },
        { label: "LC-Compliant Document Set", purpose: "Trigger payment" },
      ],
      actions: [
        "Release payment only after documentary compliance or successful document examination by the issuing bank.",
      ],
    },
  ],
  riskControls: [
    "Supplier is a legally registered company with verified ownership and authorized signatories.",
    "Supplier has demonstrable title to the product and the right to sell it.",
    "Inventory at the warehouse has been independently verified.",
    "Quality has been confirmed by an internationally recognized inspection agency (e.g., SGS, Bureau Veritas, or Intertek).",
    "Export compliance and customs documentation are complete.",
    "All contract terms are reflected consistently in the documentary package.",
    "Banking details have been independently verified.",
    "Shipping documents fully comply with the Sale & Purchase Agreement and Letter of Credit requirements.",
  ],
};
