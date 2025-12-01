export interface TabItem {
  id: string;
  title: string;
  url: string;
  domain: string;
}

export interface TabGroup {
  groupName: string;
  emoji: string;
  tabs: TabItem[];
  subgroups?: TabGroup[]; // Recursive structure for nested groups
  color: string; // Tailwind color class suffix (e.g., 'blue', 'red')
}

// Interface for the raw JSON response from Gemini
export interface OrganizeResponse {
  groups: {
    groupName: string;
    emoji: string;
    tabIds: string[]; 
    reasoning: string;
    subgroups?: {
      groupName: string;
      emoji: string;
      tabIds: string[];
      reasoning: string;
      subgroups?: {
         groupName: string;
         emoji: string;
         tabIds: string[];
         reasoning: string;
         // Level 3 support
         subgroups?: {
            groupName: string;
            emoji: string;
            tabIds: string[];
            reasoning: string;
         }[];
      }[];
    }[];
  }[];
}