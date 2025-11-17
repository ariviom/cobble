export type IdentifyPart = {
	partNum: string;
	name: string;
	imageUrl: string | null;
	confidence: number;
	colorId: number | null;
	colorName: string | null;
};

export type IdentifyCandidate = {
	partNum: string;
	name: string;
	imageUrl: string | null;
	confidence: number;
	colorId?: number;
	colorName?: string;
};

export type IdentifySet = {
	setNumber: string;
	name: string;
	year: number;
	imageUrl: string | null;
	quantity: number;
};

export type IdentifyResponse = {
	part: IdentifyPart;
	candidates: IdentifyCandidate[];
	sets: IdentifySet[];
	availableColors?: Array<{ id: number; name: string }>;
	selectedColorId?: number | null;
	assembly?: Array<{
		blPartNo: string;
		name?: string;
		imageUrl?: string | null;
		quantity: number;
		blColorId?: number;
		blColorName?: string;
		rbPartNum?: string;
	}>;
};


