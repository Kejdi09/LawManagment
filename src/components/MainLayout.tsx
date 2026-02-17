import React from "react";
import SharedHeader from "./SharedHeader";
import Sidebar from "./Sidebar";

export const MainLayout = ({ title, right, children }: { title?: string; right?: React.ReactNode; children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="md:pl-64">
        <SharedHeader title={title} right={right} />
        <main className="container py-6">{children}</main>
      </div>
    </div>
  );
};

export default MainLayout;
