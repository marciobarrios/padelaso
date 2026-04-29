"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: string;
  back?: boolean;
  backHref?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, back, backHref, action }: PageHeaderProps) {
  const router = useRouter();
  const showBack = back || Boolean(backHref);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95">
      <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 -ml-2"
            onClick={() => (backHref ? router.push(backHref) : router.back())}
          >
            <ArrowLeft className="size-5" />
          </Button>
        )}
        <h1 className="text-lg font-bold font-heading flex-1 truncate">
          {title}
        </h1>
        {action}
      </div>
    </header>
  );
}
