export type Review = {
  id: string;
  created_at: string;
  name: string;
  role: "student" | "teacher" | null;
  rating: number;
  feedback: string;
};

export type ReviewInsert = {
  name: string;
  role: "student" | "teacher";
  rating: number;
  feedback: string;
};
