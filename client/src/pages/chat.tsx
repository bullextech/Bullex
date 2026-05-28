import { ChatPanel } from "@/components/chat-panel";
import { MessageSquare } from "lucide-react";

export default function Chat() {
  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="flex items-center gap-3.5">
            <div className="p-2 bg-white/10 rounded flex-shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-serif font-bold leading-tight" data-testid="text-chat-title">
                Bullex Chat
              </h1>
              <p className="text-white/60 text-sm leading-snug mt-1">
                Real-time messaging and 1-to-1 video calls between platform members.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="h-[calc(100vh-260px)] min-h-[500px]">
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
