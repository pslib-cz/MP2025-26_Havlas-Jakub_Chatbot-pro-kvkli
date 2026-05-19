export type BookRecord = {
  Identifier: string;
  Title: string;
  Author: string;
  Contributors: string;
  Publisher: string;
  PublicationYear: string;
  ISBN: string;
  ISSN: string;
  Subjects: string;
  Description: string;
  Language: string;
  PhysicalDescription: string;
  Series: string;
  Notes: string;
  RecordType: string;
  ContentType: string;
  MediaType: string;
  CarrierType: string;
};

export type MarcSubfield = {
  "@_code": string;
  "#text": string;
};

export type MarcDatafield = {
  "@_tag": string;
  "@_ind1"?: string;
  "@_ind2"?: string;
  subfield?: MarcSubfield | MarcSubfield[];
};

export type MarcControlfield = {
  "@_tag": string;
  "#text": string;
};

export type MarcRecord = {
  leader?: string;
  controlfield?: MarcControlfield | MarcControlfield[];
  datafield?: MarcDatafield | MarcDatafield[];
};

export type OAIRecord = {
  header?: {
    identifier?: string;
  };
  metadata?: {
    record?: MarcRecord;
  };
};
