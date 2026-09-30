// src/components/ImageExportDialog.tsx

import { useState, useRef } from "react";
import { Image, Loader2, Check, Calendar, ImageIcon, LayoutGrid, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TautulliUser, WrappedStats, StreamingLocation } from "@/types/tautulli";
import { YearSelector, YearSelection, getDisplayYear, getDefaultYear, toPeriod } from "./YearSelector";
import { getServerAdminSettings } from "@/lib/serverConfig";
import { api, isBuilding } from "@/lib/api";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { ExportableWrappedReport } from "./ExportableWrappedReport";
import { ExportableStorySlides } from "./ExportableStorySlides";

interface ImageExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  users: TautulliUser[];
  oldestYear?: number;
}

type ExportMode = 'single' | 'slides' | 'both';

// Special value for "All Users" selection
const ALL_USERS_ID = -999;

export const ImageExportDialog = ({
  isOpen,
  onClose,
  users,
  oldestYear,
}: ImageExportDialogProps) => {
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentUser, setCurrentUser] = useState("");
  const [currentPhase, setCurrentPhase] = useState("");
  const [exportMode, setExportMode] = useState<ExportMode>('single');
  const [yearSelection, setYearSelection] = useState<YearSelection>({
    type: 'year',
    year: getDefaultYear(getServerAdminSettings().currentYearFrom)
  });
  const [renderData, setRenderData] = useState<{ user: TautulliUser; stats: WrappedStats; geoLocations: StreamingLocation[] } | null>(null);
  const [renderMode, setRenderMode] = useState<'full' | 'slides'>('full');
  const renderContainerRef = useRef<HTMLDivElement>(null);
  const slidesContainerRef = useRef<HTMLDivElement>(null);
  const isRenderReadyRef = useRef(false);

  const toggleUser = (userId: number) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const toggleAll = () => {
    // Count only real users (not ALL_USERS_ID)
    const realUserIds = users.map(u => u.user_id);
    const selectedRealUsers = [...selectedUserIds].filter(id => id !== ALL_USERS_ID);
    
    if (selectedRealUsers.length === realUserIds.length) {
      // Deselect all real users, keep ALL_USERS_ID if selected
      const newSelected = new Set<number>();
      if (selectedUserIds.has(ALL_USERS_ID)) {
        newSelected.add(ALL_USERS_ID);
      }
      setSelectedUserIds(newSelected);
    } else {
      // Select all real users, keep ALL_USERS_ID if selected
      const newSelected = new Set(realUserIds);
      if (selectedUserIds.has(ALL_USERS_ID)) {
        newSelected.add(ALL_USERS_ID);
      }
      setSelectedUserIds(newSelected);
    }
  };

  const waitForRender = (mode: 'full' | 'slides'): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 200;
      const checkReady = () => {
        attempts++;
        const container = mode === 'full' ? renderContainerRef.current : slidesContainerRef.current;
        
        // Check if ready flag is set AND container exists AND has content
        if (isRenderReadyRef.current && container) {
          const hasContent = container.querySelector('.export-report') || container.querySelector('.story-slide');
          if (hasContent) {
            console.log(`[waitForRender] ${mode} ready after ${attempts} attempts`);
            resolve();
            return;
          }
        }
        
        if (attempts >= maxAttempts) {
          console.error(`[waitForRender] Timeout for ${mode}:`, {
            ready: isRenderReadyRef.current,
            container: !!container,
            children: container?.children.length,
            innerHTML: container?.innerHTML.substring(0, 200)
          });
          reject(new Error(`Render timeout for ${mode}`));
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
    });
  };

  const captureFullImage = async (element: HTMLElement): Promise<Blob> => {
    // Wait for any images to load
    const images = element.querySelectorAll('img');
    await Promise.all(
      Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(() => resolve(), 3000);
        });
      })
    );

    // Give extra time for rendering
    await new Promise(resolve => setTimeout(resolve, 300));

    const canvas = await html2canvas(element, {
      backgroundColor: '#0a0a0f',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: element.scrollWidth,
      height: element.scrollHeight,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
      x: 0,
      y: 0,
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to create image"));
        },
        'image/png',
        1.0
      );
    });
  };

  const captureSlides = async (container: HTMLElement): Promise<Blob[]> => {
    const slides = container.querySelectorAll('.story-slide');
    console.log(`[captureSlides] Found ${slides.length} slides`);
    const blobs: Blob[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slideElement = slides[i] as HTMLElement;
      
      // Wait for any images in this slide
      const images = slideElement.querySelectorAll('img');
      await Promise.all(
        Array.from(images).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(() => resolve(), 2000);
          });
        })
      );

      try {
        const canvas = await html2canvas(slideElement, {
          backgroundColor: '#0a0a0f',
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          width: 540,
          height: 960,
          x: 0,
          y: 0,
        });

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error(`Failed to create slide ${i + 1}`));
            },
            'image/png',
            1.0
          );
        });

        blobs.push(blob);
        console.log(`[captureSlides] Captured slide ${i + 1}/${slides.length}`);
      } catch (err) {
        console.error(`[captureSlides] Failed to capture slide ${i + 1}:`, err);
      }
    }

    return blobs;
  };

  const handleExport = async () => {
    if (selectedUserIds.size === 0) {
      toast.error("Please select at least one user");
      return;
    }

    setIsExporting(true);
    setProgress(0);

    const zip = new JSZip();
    const period = toPeriod(yearSelection);
    const displayYear = getDisplayYear(yearSelection);

    // Get admin settings
    const adminSettings = getServerAdminSettings();
    const enableGeolocation = adminSettings.enableGeolocation || false;

    // Stats are computed server-side; exports run with the admin session
    const fetchReportData = async (user: number | "all") => {
      const report = await api.report({ user, period });
      let geoLocations: StreamingLocation[] = [];
      if (enableGeolocation) {
        setCurrentPhase("Locating streaming sessions...");
        try {
          geoLocations = (await api.reportLocations({ user, period })).locations;
        } catch (e) {
          console.warn("Failed to fetch geolocation:", e);
        }
      }
      return { stats: report.stats, geoLocations };
    };

    // Separate "All Users" from individual users
    const hasAllUsers = selectedUserIds.has(ALL_USERS_ID);
    const individualUserIds = [...selectedUserIds].filter(id => id !== ALL_USERS_ID);
    const selectedUsers = users.filter(u => individualUserIds.includes(u.user_id));
    
    // Calculate total items to process
    const totalItems = (hasAllUsers ? 1 : 0) + selectedUsers.length;
    let completed = 0;

    try {
      // Process "All Users" first if selected
      if (hasAllUsers) {
        setCurrentUser("All Users");
        setCurrentPhase("Fetching watch history...");

        const { stats, geoLocations } = await fetchReportData("all");

        // Create a pseudo-user for "All Users"
        const allUsersUser: TautulliUser = {
          user_id: ALL_USERS_ID,
          username: "all_users",
          friendly_name: "All Users",
          thumb: "",
        };

        // Capture full image
        if (exportMode === 'single' || exportMode === 'both') {
          setCurrentPhase("Rendering full report...");
          isRenderReadyRef.current = false;
          setRenderMode('full');
          setRenderData({ user: allUsersUser, stats, geoLocations });
          
          await new Promise(resolve => setTimeout(resolve, 200));
          
          try {
            await waitForRender('full');
            await new Promise(resolve => setTimeout(resolve, 300));

            if (renderContainerRef.current) {
              setCurrentPhase("Capturing full image...");
              const reportElement = renderContainerRef.current.querySelector('.export-report') as HTMLElement;
              if (reportElement) {
                const imageBlob = await captureFullImage(reportElement);
                zip.file(`All_Users_Plex_Wrapped_${displayYear.replace(/\s/g, '_')}.png`, imageBlob);
              } else {
                throw new Error("Report element not found");
              }
            }
          } catch (e) {
            console.error("Full image capture failed:", e);
            toast.error(`Failed to capture full image for All Users`);
          }
        }

        // Capture slides
        if (exportMode === 'slides' || exportMode === 'both') {
          setCurrentPhase("Rendering story slides...");
          isRenderReadyRef.current = false;
          setRenderMode('slides');
          setRenderData(null);
          await new Promise(resolve => setTimeout(resolve, 100));
          setRenderData({ user: allUsersUser, stats, geoLocations });
          
          await new Promise(resolve => setTimeout(resolve, 200));
          
          try {
            await waitForRender('slides');
            await new Promise(resolve => setTimeout(resolve, 300));

            if (slidesContainerRef.current) {
              setCurrentPhase("Capturing story slides...");
              const slides = await captureSlides(slidesContainerRef.current);
              if (slides.length > 0) {
                const slidesFolder = zip.folder(`All_Users_Slides`);
                slides.forEach((blob, i) => {
                  slidesFolder?.file(`slide_${String(i + 1).padStart(2, '0')}.png`, blob);
                });
              } else {
                throw new Error("No slides captured");
              }
            }
          } catch (e) {
            console.error("Slides capture failed:", e);
            toast.error(`Failed to capture slides for All Users`);
          }
        }

        completed++;
        setProgress((completed / totalItems) * 100);
      }

      // Process individual users
      for (const user of selectedUsers) {
        const userName = user.friendly_name || user.username;
        const safeFileName = userName.replace(/[^a-zA-Z0-9]/g, "_");
        setCurrentUser(userName);
        setCurrentPhase("Fetching watch history...");

        const { stats, geoLocations } = await fetchReportData(user.user_id);

        // Capture full image
        if (exportMode === 'single' || exportMode === 'both') {
          setCurrentPhase("Rendering full report...");
          isRenderReadyRef.current = false;
          setRenderMode('full');
          setRenderData({ user, stats, geoLocations });
          
          // Wait for React to update state and render
          await new Promise(resolve => setTimeout(resolve, 200));
          
          try {
            await waitForRender('full');
            await new Promise(resolve => setTimeout(resolve, 300));

            if (renderContainerRef.current) {
              setCurrentPhase("Capturing full image...");
              const reportElement = renderContainerRef.current.querySelector('.export-report') as HTMLElement;
              if (reportElement) {
                const imageBlob = await captureFullImage(reportElement);
                zip.file(`${safeFileName}_Plex_Wrapped_${displayYear.replace(/\s/g, '_')}.png`, imageBlob);
              } else {
                throw new Error("Report element not found");
              }
            }
          } catch (e) {
            console.error("Full image capture failed:", e);
            toast.error(`Failed to capture full image for ${userName}`);
          }
        }

        // Capture slides
        if (exportMode === 'slides' || exportMode === 'both') {
          setCurrentPhase("Rendering story slides...");
          isRenderReadyRef.current = false;
          setRenderMode('slides');
          setRenderData(null);
          await new Promise(resolve => setTimeout(resolve, 100));
          setRenderData({ user, stats, geoLocations });
          
          // Wait for React to update state and render
          await new Promise(resolve => setTimeout(resolve, 200));
          
          try {
            await waitForRender('slides');
            await new Promise(resolve => setTimeout(resolve, 300));

            if (slidesContainerRef.current) {
              setCurrentPhase("Capturing story slides...");
              const slides = await captureSlides(slidesContainerRef.current);
              if (slides.length > 0) {
                const slidesFolder = zip.folder(`${safeFileName}_Slides`);
                slides.forEach((blob, i) => {
                  slidesFolder?.file(`slide_${String(i + 1).padStart(2, '0')}.png`, blob);
                });
              } else {
                throw new Error("No slides captured");
              }
            }
          } catch (e) {
            console.error("Slides capture failed:", e);
            toast.error(`Failed to capture slides for ${userName}`);
          }
        }

        completed++;
        setProgress((completed / totalItems) * 100);
      }

      // Clear render data
      setRenderData(null);
      isRenderReadyRef.current = false;

      // Download
      const fileCount = Object.keys(zip.files).length;
      if (fileCount === 0) {
        toast.error("No images were captured");
        return;
      }

      if (totalItems === 1 && exportMode === 'single') {
        const files = Object.keys(zip.files);
        if (files.length > 0) {
          const blob = await zip.files[files[0]].async('blob');
          saveAs(blob, files[0]);
        }
      } else {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, `Plex_Wrapped_${displayYear.replace(/\s/g, '_')}_Export.zip`);
      }

      toast.success(`Successfully exported ${totalItems} report(s)`);
      onClose();
    } catch (error) {
      console.error("Export error:", error);
      toast.error(
        isBuilding(error)
          ? "The stats cache is still being built. Please try again in a few minutes."
          : "Failed to export images. Please try again."
      );
    } finally {
      setIsExporting(false);
      setProgress(0);
      setCurrentUser("");
      setCurrentPhase("");
      setRenderData(null);
      isRenderReadyRef.current = false;
    }
  };

  const handleRenderReady = () => {
    console.log(`[handleRenderReady] Called for mode: ${renderMode}`);
    isRenderReadyRef.current = true;
  };

  const handleClose = () => {
    if (!isExporting) {
      onClose();
    }
  };

  // Offscreen container styles - must NOT use visibility:hidden
  const offscreenStyle: React.CSSProperties = {
    position: 'absolute',
    left: '-10000px',
    top: '0px',
    opacity: 1, // Must be visible for html2canvas
    pointerEvents: 'none',
    zIndex: -9999,
  };

  // Count selected items for display
  const selectedCount = selectedUserIds.size;
  const realUserCount = users.length;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="w-5 h-5 text-primary" />
              Export as Images
            </DialogTitle>
            <DialogDescription>
              Generate PNG images of the Wrapped report.
            </DialogDescription>
          </DialogHeader>

          {isExporting ? (
            <div className="py-8 space-y-4">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                <p className="text-sm font-medium text-foreground">{currentUser}</p>
                <p className="text-xs text-muted-foreground mt-1">{currentPhase}</p>
              </div>
              <Progress value={progress} className="w-full" />
              <p className="text-xs text-center text-muted-foreground">{Math.round(progress)}% complete</p>
            </div>
          ) : (
            <>
              {/* Export Mode */}
              <div className="py-3 border-b">
                <Label className="text-sm font-medium mb-3 block">Export Format</Label>
                <RadioGroup value={exportMode} onValueChange={(v) => setExportMode(v as ExportMode)} className="grid grid-cols-3 gap-2">
                  <div>
                    <RadioGroupItem value="single" id="single" className="peer sr-only" />
                    <Label
                      htmlFor="single"
                      className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer text-center"
                    >
                      <ImageIcon className="w-5 h-5 mb-1" />
                      <span className="text-xs">Full Image</span>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="slides" id="slides" className="peer sr-only" />
                    <Label
                      htmlFor="slides"
                      className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer text-center"
                    >
                      <LayoutGrid className="w-5 h-5 mb-1" />
                      <span className="text-xs">Story Slides</span>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="both" id="both" className="peer sr-only" />
                    <Label
                      htmlFor="both"
                      className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer text-center"
                    >
                      <Check className="w-5 h-5 mb-1" />
                      <span className="text-xs">Both</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Year Selector */}
              <div className="flex items-center gap-2 py-2 border-b">
                <Calendar className="w-4 h-4 text-primary" />
                <Label className="text-sm font-medium">Time Period</Label>
                <div className="ml-auto">
                  <YearSelector 
                    selection={yearSelection} 
                    onSelectionChange={setYearSelection}
                    oldestYear={oldestYear}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b">
                <Label className="text-sm font-medium">
                  Select Users ({selectedCount} selected)
                </Label>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {[...selectedUserIds].filter(id => id !== ALL_USERS_ID).length === realUserCount ? "Deselect All" : "Select All"}
                </Button>
              </div>

              <ScrollArea className="h-[200px] pr-4">
                <div className="space-y-2 py-2">
                  {/* All Users option at the top */}
                  <div
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer border-b border-border pb-3 mb-2"
                    onClick={() => toggleUser(ALL_USERS_ID)}
                  >
                    <Checkbox
                      id="user-all"
                      checked={selectedUserIds.has(ALL_USERS_ID)}
                      onCheckedChange={() => toggleUser(ALL_USERS_ID)}
                    />
                    <div className="flex-1 flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      <Label htmlFor="user-all" className="text-sm font-medium cursor-pointer">
                        All Users
                      </Label>
                    </div>
                    {selectedUserIds.has(ALL_USERS_ID) && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </div>

                  {/* Individual users */}
                  {users.map((user) => (
                    <div
                      key={user.user_id}
                      className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleUser(user.user_id)}
                    >
                      <Checkbox
                        id={`user-${user.user_id}`}
                        checked={selectedUserIds.has(user.user_id)}
                        onCheckedChange={() => toggleUser(user.user_id)}
                      />
                      <div className="flex-1">
                        <Label htmlFor={`user-${user.user_id}`} className="text-sm font-medium cursor-pointer">
                          {user.friendly_name || user.username}
                        </Label>
                        {user.friendly_name && user.friendly_name !== user.username && (
                          <p className="text-xs text-muted-foreground">@{user.username}</p>
                        )}
                      </div>
                      {selectedUserIds.has(user.user_id) && (
                        <Check className="w-4 h-4 text-primary" />
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleExport} disabled={selectedUserIds.size === 0}>
                  <Image className="w-4 h-4 mr-2" />
                  Export {selectedCount} Report{selectedCount !== 1 ? 's' : ''}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden render containers - positioned offscreen but NOT hidden */}
      {renderData && renderMode === 'full' && (
        <div style={{ ...offscreenStyle, width: '800px' }}>
          <div ref={renderContainerRef} style={{ backgroundColor: '#0a0a0f' }}>
            <ExportableWrappedReport
              user={renderData.user}
              stats={renderData.stats}
              yearSelection={yearSelection}
              geoLocations={renderData.geoLocations}
              onReady={handleRenderReady}
            />
          </div>
        </div>
      )}
      
      {renderData && renderMode === 'slides' && (
        <div style={{ ...offscreenStyle, width: '540px' }}>
          <div ref={slidesContainerRef} style={{ backgroundColor: '#0a0a0f' }}>
            <ExportableStorySlides
              user={renderData.user}
              stats={renderData.stats}
              yearSelection={yearSelection}
              geoLocations={renderData.geoLocations}
              onReady={handleRenderReady}
            />
          </div>
        </div>
      )}
    </>
  );
};