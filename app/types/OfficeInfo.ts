import type { DaySchedule } from "./OpeningHours";

export type OfficeInfo = {
    branch: string;
    openingHours: DaySchedule[];
    openingHoursUrl: string;
    contact?: {
        librarian?: string;
        phones?: string[];
        email?: string;
        address?: string;
        transport?: string;
    };
    services?: string[];
    detailUrl?: string;
};
