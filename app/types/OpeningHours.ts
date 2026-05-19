export type DaySchedule = {
    day: string;
    hours: string[];
};

export type BranchOpeningHours = {
    branch: string;
    schedule: DaySchedule[];
    url: string;
};
