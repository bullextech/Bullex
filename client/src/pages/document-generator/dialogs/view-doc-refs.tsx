import { Label } from "@/components/ui/label";
import { useDocGen } from "../use-doc-gen";

export default function ViewDocRefs() {
  const { viewDoc } = useDocGen();
  if (!viewDoc || !(viewDoc.enquiryRef || viewDoc.dealRecapNumber || viewDoc.parentDocId)) return null;

  return (
    <div className="border-t pt-4">
      <div className="grid grid-cols-2 gap-4 text-xs">
        {viewDoc.enquiryRef && (
          <div>
            <Label className="text-xs text-muted-foreground">Enquiry Reference</Label>
            <p className="font-medium" data-testid="text-enquiry-ref">{viewDoc.enquiryRef}</p>
          </div>
        )}
        {viewDoc.dealRecapNumber && (
          <div>
            <Label className="text-xs text-muted-foreground">Deal Recap / SPA Number</Label>
            <p className="font-medium" data-testid="text-deal-recap-number">{viewDoc.dealRecapNumber}</p>
          </div>
        )}
      </div>
    </div>
  );
}
