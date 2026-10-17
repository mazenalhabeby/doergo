
type Attachment = { fileName: string; fileUrl: string; fileType: string; fileSize: number };

// Customers never see internal agent notes; agents see everything.
const publicMessageWhere = { isInternalNote: false } as const;

export { Attachment, publicMessageWhere };
