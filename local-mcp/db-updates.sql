-- Check if style_profiles table exists and create it if not
CREATE TABLE IF NOT EXISTS style_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  style_parameters JSONB NOT NULL,
  dialogue_parameters JSONB,
  example_passages TEXT[] DEFAULT '{}'::TEXT[],
  notes TEXT,
  project_specific BOOLEAN DEFAULT FALSE,
  project_name TEXT,
  project_id UUID
);

-- Add new columns to style_profiles table if they don't exist
DO $$ 
BEGIN
  -- Add genre column if it doesn't exist
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'style_profiles' AND column_name = 'genre'
  ) THEN
    ALTER TABLE style_profiles ADD COLUMN genre TEXT[] DEFAULT '{}'::TEXT[];
  END IF;

  -- Add comparable_authors column if it doesn't exist
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'style_profiles' AND column_name = 'comparable_authors'
  ) THEN
    ALTER TABLE style_profiles ADD COLUMN comparable_authors TEXT[] DEFAULT '{}'::TEXT[];
  END IF;

  -- Add user_comments column if it doesn't exist
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'style_profiles' AND column_name = 'user_comments'
  ) THEN
    ALTER TABLE style_profiles ADD COLUMN user_comments TEXT;
  END IF;
END $$;

-- Create the profile_samples table if it doesn't exist
CREATE TABLE IF NOT EXISTS profile_samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES style_profiles(id) ON DELETE CASCADE,
  sample_id UUID,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  weight FLOAT DEFAULT 1.0,
  UNIQUE(profile_id, sample_id)
);

-- Create a representative_samples table
CREATE TABLE IF NOT EXISTS representative_samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES style_profiles(id) ON DELETE CASCADE,
  text_content TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);