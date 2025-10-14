"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import ClusterForm from "@/components/ClusterForm";
import AuthGuard from "@/components/AuthGuard";

function NewClusterPageContent() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/clusters" className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">返回集群列表</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ClusterForm />
      </main>
    </div>
  );
}

export default function NewClusterPage() {
  return (
    <AuthGuard>
      <NewClusterPageContent />
    </AuthGuard>
  );
}
