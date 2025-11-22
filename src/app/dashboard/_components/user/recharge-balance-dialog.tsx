"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DollarSign } from "lucide-react";
import { RechargeBalanceForm } from "./forms/recharge-balance-form";
import { FormErrorBoundary } from "@/components/form-error-boundary";
import type { UserDisplay } from "@/types/user";

interface RechargeBalanceDialogProps {
  user: UserDisplay;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
  className?: string;
}

export function RechargeBalanceDialog({
  user,
  variant = "ghost",
  size = "sm",
  showLabel = false,
  className,
}: RechargeBalanceDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <DollarSign className="h-4 w-4" />
          {showLabel && "充值"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <FormErrorBoundary>
          <RechargeBalanceForm
            userId={user.id}
            userName={user.name}
            currentBalance={user.balanceUsd ?? 0}
            onSuccess={() => setOpen(false)}
          />
        </FormErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}
