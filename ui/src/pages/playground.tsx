import { useState } from 'react';
import { Check, ChevronsUpDown, Copy, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ModeToggle } from '@/components/layout/mode-toggle';

const SAMPLE_PRODUCTS = [
  { id: '1', name: 'Rice Basmati 5kg', price: '৳850' },
  { id: '2', name: 'Sugar 1kg', price: '৳95' },
  { id: '3', name: 'Paracetamol 500mg', price: '৳120' },
  { id: '4', name: 'Amoxicillin 250mg', price: '৳350' },
  { id: '5', name: 'Bottled Water 1L', price: '৳20' },
];

export function Playground() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [comboValue, setComboValue] = useState('');

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar with mode toggle */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">Rizqun UI — Playground</span>
            <Badge variant="secondary">Phase 0.2</Badge>
          </div>
          <ModeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 p-6">
        {/* Intro card */}
        <Card>
          <CardHeader>
            <CardTitle>shadcn/ui smoke test</CardTitle>
            <CardDescription>
              Every base primitive from Phase 0.2 is rendered here. Toggle the theme with the button
              in the top-right — every component must look correct in both light and dark mode.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This page is temporary — it will be replaced by the routing shell in Phase 0.3.
            </p>
          </CardContent>
        </Card>

        {/* Buttons + badges */}
        <Card>
          <CardHeader>
            <CardTitle>Buttons & Badges</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="xs">Extra small</Button>
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Settings">
                <Settings className="size-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Inputs + form controls */}
        <Card>
          <CardHeader>
            <CardTitle>Inputs & Form Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="sample-email">Email</Label>
              <Input id="sample-email" type="email" placeholder="operator@rizqun.com" />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="terms" />
              <Label htmlFor="terms" className="text-sm font-normal">
                Accept terms and conditions
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="airplane" />
              <Label htmlFor="airplane" className="text-sm font-normal">
                Airplane mode
              </Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="select-category">Category</Label>
              <Select>
                <SelectTrigger id="select-category" className="w-[240px]">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grocery">Grocery</SelectItem>
                  <SelectItem value="medicine">Medicine</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabs + Separator */}
        <Card>
          <CardHeader>
            <CardTitle>Tabs & Separator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="account">
              <TabsList>
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="password">Password</TabsTrigger>
              </TabsList>
              <TabsContent value="account" className="mt-3">
                Account settings content goes here.
              </TabsContent>
              <TabsContent value="password" className="mt-3">
                Password change form goes here.
              </TabsContent>
            </Tabs>
            <Separator />
            <p className="text-sm text-muted-foreground">Below the separator.</p>
          </CardContent>
        </Card>

        {/* Avatar + Tooltip */}
        <Card>
          <CardHeader>
            <CardTitle>Avatar & Tooltip</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Avatar>
              <AvatarImage src="" alt="Operator" />
              <AvatarFallback>OP</AvatarFallback>
            </Avatar>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  Hover me
                </Button>
              </TooltipTrigger>
              <TooltipContent>And this is a tooltip.</TooltipContent>
            </Tooltip>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Table</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SAMPLE_PRODUCTS.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.price}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Dialog + AlertDialog */}
        <Card>
          <CardHeader>
            <CardTitle>Dialogs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Open Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dialog title</DialogTitle>
                  <DialogDescription>
                    Dialog description goes here. You can close with the X or by clicking outside.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <Label htmlFor="dialog-input">Sample field</Label>
                  <Input id="dialog-input" placeholder="Type here…" />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setDialogOpen(false)}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete order</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the order and remove
                    it from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => setAlertOpen(false)}>
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* DropdownMenu */}
        <Card>
          <CardHeader>
            <CardTitle>Dropdown Menu</CardTitle>
          </CardHeader>
          <CardContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Open menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Settings className="mr-2 size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy className="mr-2 size-4" />
                  Copy ID
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>

        {/* Command in a Popover (combobox) */}
        <Card>
          <CardHeader>
            <CardTitle>Command (in Popover)</CardTitle>
          </CardHeader>
          <CardContent>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-[240px] justify-between">
                  {comboValue
                    ? SAMPLE_PRODUCTS.find((p) => p.id === comboValue)?.name
                    : 'Select product…'}
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search product…" />
                  <CommandList>
                    <CommandEmpty>No product found.</CommandEmpty>
                    <CommandGroup>
                      {SAMPLE_PRODUCTS.map((p) => (
                        <CommandItem key={p.id} value={p.name} onSelect={() => setComboValue(p.id)}>
                          <Check
                            className={`mr-2 size-4 ${
                              comboValue === p.id ? 'opacity-100' : 'opacity-0'
                            }`}
                          />
                          {p.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        {/* ScrollArea + Skeleton */}
        <Card>
          <CardHeader>
            <CardTitle>ScrollArea & Skeleton</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScrollArea className="h-32 rounded-md border p-4">
              <p className="text-sm">
                Item 1
                <br />
                Item 2
                <br />
                Item 3
                <br />
                Item 4
                <br />
                Item 5
                <br />
                Item 6
                <br />
                Item 7
                <br />
                Item 8
                <br />
                Item 9
                <br />
                Item 10
                <br />
              </p>
            </ScrollArea>
            <div className="space-y-2">
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-4 w-[160px]" />
              <Skeleton className="h-4 w-[220px]" />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
