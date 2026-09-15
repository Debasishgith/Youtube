"use client";
import { useState } from "react";
import { Button } from "./button";

const categories = [
  "All",
  "Music",
  "Gaming",
  "Movies",
  "News",
  "Sports",
  "Technology",
  "Comedy",
  "Education",
  "Science",
  "Travel",
  "Food",
  "Fashion",
];

const Category = () => {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  return (
    <div className="mb-6 flex gap-2 ">
      {categories.map((cat) => (
        <Button
          key={cat}
          onClick={() => setActiveCategory(cat)}
          variant={activeCategory === cat ? "default" : "secondary"}
        >
          {cat}
        </Button>
      ))}
    </div>
  );
};

export default Category;
