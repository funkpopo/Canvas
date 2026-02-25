"use client";

import ClusterForm from "@/components/ClusterForm";

function NewClusterPageContent() {
  return (
    <div className="space-y-6">
      <ClusterForm />
    </div>
  );
}

export default function NewClusterPage() {
  return <NewClusterPageContent />;
}
