import { Link } from 'react-router-dom';
import { LogOut, Settings, User } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sidebar } from './sidebar';
import { Breadcrumb } from './breadcrumb';
import { ModeToggle } from './mode-toggle';

// Placeholder for the logged-in user. Replaced with real auth in Phase 1.2.
const PLACEHOLDER_USER = {
  name: 'Operator',
  email: 'operator@rizqun.com',
  role: 'user' as 'user' | 'super_admin',
};

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
      {/* Left: hamburger (mobile) + breadcrumb */}
      <div className="flex items-center gap-2">
        <Sidebar />
        <Breadcrumb />
      </div>

      {/* Right: theme toggle + user menu */}
      <div className="flex items-center gap-2">
        <ModeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="User menu">
              <Avatar className="size-8">
                <AvatarFallback>{PLACEHOLDER_USER.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{PLACEHOLDER_USER.name}</span>
                <span className="text-xs text-muted-foreground">{PLACEHOLDER_USER.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/dashboard">
                <User className="mr-2 size-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Settings className="mr-2 size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 size-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
