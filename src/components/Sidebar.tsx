import React from "react";
import Nav from "./Nav";

export const Sidebar = () => {
  return (
    <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col md:border-r md:bg-background md:shadow-sm">
      <div className="flex flex-col h-full">
        <div className="p-4 border-b bg-background">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center text-primary font-semibold">LM</div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">LawMan</h1>
              <div className="text-xs text-muted-foreground">Manage cases & customers</div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <Nav />
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
