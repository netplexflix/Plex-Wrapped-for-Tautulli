import { Calendar as CalendarIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultReportYear } from "@/lib/adminStorage";

export type YearSelection = 
  | { type: 'year'; year: number }
  | { type: 'rolling' }
  | { type: 'alltime' };

interface YearSelectorProps {
  selection: YearSelection;
  onSelectionChange: (selection: YearSelection) => void;
  oldestYear?: number;
}

const getAvailableYears = (oldestYear?: number): number[] => {
  const currentYear = new Date().getFullYear();
  const startYear = oldestYear || (currentYear - 10);
  const years: number[] = [];
  for (let year = currentYear; year >= startYear; year--) {
    years.push(year);
  }
  return years;
};

// The year reports open on: the previous year until the admin's "current year from" date
// (Admin Panel, default December 1st), then the current year. Uses the visitor's local date.
export const getDefaultYear = (currentYearFrom: string): number => {
  const now = new Date();
  return defaultReportYear(now.getFullYear(), now.getMonth(), now.getDate(), currentYearFrom);
};

// Calculate number of years for "all time" display
export const getYearsCount = (oldestYear?: number): number => {
  const currentYear = new Date().getFullYear();
  if (!oldestYear) return 1;
  return currentYear - oldestYear + 1;
};

export const YearSelector = ({
  selection,
  onSelectionChange,
  oldestYear,
}: YearSelectorProps) => {
  const years = getAvailableYears(oldestYear);
  
  const currentValue = selection.type === 'rolling' 
    ? 'rolling' 
    : selection.type === 'alltime'
    ? 'alltime'
    : selection.year.toString();

  const handleValueChange = (value: string) => {
    if (value === 'rolling') {
      onSelectionChange({ type: 'rolling' });
    } else if (value === 'alltime') {
      onSelectionChange({ type: 'alltime' });
    } else {
      onSelectionChange({ type: 'year', year: parseInt(value) });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <CalendarIcon className="w-4 h-4 text-primary" />
      <Select value={currentValue} onValueChange={handleValueChange}>
        <SelectTrigger className="w-[180px] bg-card border-border">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          <SelectItem value="alltime">All Time</SelectItem>
          <SelectItem value="rolling">Past 12 months</SelectItem>
          {years.map((year) => (
            <SelectItem key={year} value={year.toString()}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export const getDateRangeFromSelection = (selection: YearSelection): { startDate: Date; endDate: Date } => {
  if (selection.type === 'alltime') {
    // For all-time, use a very old date as start
    const startDate = new Date(2000, 0, 1);
    const endDate = new Date();
    return { startDate, endDate };
  } else if (selection.type === 'rolling') {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    return { startDate, endDate };
  } else {
    const startDate = new Date(selection.year, 0, 1); // Jan 1
    const endDate = new Date(selection.year, 11, 31); // Dec 31
    return { startDate, endDate };
  }
};

// The report period sent to the server: "2025", "rolling" or "alltime"
export const toPeriod = (selection: YearSelection): string => (selection.type === "year" ? String(selection.year) : selection.type);

export const getDisplayYear = (selection: YearSelection): string => {
  if (selection.type === 'alltime') {
    return 'All Time';
  }
  if (selection.type === 'rolling') {
    return 'Past Year';
  }
  return selection.year.toString();
};
