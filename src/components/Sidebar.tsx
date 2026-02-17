import React from "react";
import Nav from "./Nav";

export const Sidebar = () => {
  return (
    <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col md:border-r md:bg-background">
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <h1 className="text-lg font-semibold">LawMan</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Nav />
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
