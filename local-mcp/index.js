require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Tool definitions
const analyzeWritingSampleTool = {
  name: "analyze_writing_sample",
  description: "Analyzes a text sample to identify writing style characteristics and patterns",
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string", 
        description: "The text content to analyze"
      },
      saveSample: {
        type: "boolean",
        description: "Whether to save the text as a sample in the database",
        default: true
      },
      title: {
        type: "string",
        description: "Title for the writing sample (required if saveSample is true and no sampleId provided)"
      },
      author: {
        type: "string",
        description: "Author of the writing sample"
      },
      sampleType: {
        type: "string",
        description: "Type of writing (novel, screenplay, etc.)"
      },
      tags: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Tags for categorizing the sample"
      },
      projectId: {
        type: "string",
        description: "ID of the project this sample belongs to"
      },
      sampleId: {
        type: "string",
        description: "Optional ID of existing sample to update with analysis"
      }
    },
    required: ["text"]
  }
};

const getStyleProfileTool = {
  name: "get_style_profile",
  description: "Retrieves a writing style profile with guidance for writing in that style",
  inputSchema: {
    type: "object",
    properties: {
      profileId: {
        type: "string",
        description: "ID of the style profile to retrieve"
      },
      includeExamples: {
        type: "boolean",
        description: "Whether to include sample excerpts",
        default: false
      },
      includeStyleNotes: {
        type: "boolean",
        description: "Whether to include human-readable style guidance notes",
        default: true
      }
    },
    required: ["profileId"]
  }
};

const createStyleProfileTool = {
  name: "create_style_profile",
  description: "Creates or updates a style profile based on analyzed writing samples",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name for this style profile"
      },
      description: {
        type: "string",
        description: "Description of this style profile"
      },
      sampleIds: {
        type: "array",
        items: {
          type: "string"
        },
        description: "IDs of writing samples to include in this profile"
      },
      projectId: {
        type: "string",
        description: "ID of the project this profile belongs to"
      },
      profileId: {
        type: "string",
        description: "Optional ID of existing profile to update"
      },
      genre: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Genres associated with this style profile"
      },
      comparableAuthors: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Authors with similar writing style"
      },
      userComments: {
        type: "string",
        description: "Additional notes or requirements for this style"
      },
      representativeSamples: {
        type: "array",
        items: {
          type: "object",
          properties: {
            textContent: {
              type: "string",
              description: "An exemplary text passage representing this style"
            },
            description: {
              type: "string",
              description: "Description of what makes this sample representative"
            }
          }
        },
        description: "Text samples that exemplify this writing style"
      },
      addToExisting: {
        type: "boolean",
        description: "Whether to add these samples to an existing profile instead of replacing",
        default: false
      }
    },
    required: ["name", "sampleIds"]
  }
};

const writeInStyleTool = {
  name: "write_in_style",
  description: "Instructs Claude to write text following a specific style profile",
  inputSchema: {
    type: "object",
    properties: {
      profileId: {
        type: "string",
        description: "ID of the style profile to use"
      },
      prompt: {
        type: "string",
        description: "What to write about"
      },
      length: {
        type: "number",
        description: "Approximate target word count"
      },
      includeStyleNotes: {
        type: "boolean",
        description: "Whether to include style guidance notes",
        default: true
      }
    },
    required: ["prompt"]
  }
};

// Helper functions and implementations

// Calculate average sentence length and other metrics
const calculateSentenceMetrics = (text) => {
  const sentences = text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0);
  const sentenceLengths = sentences.map(sentence => sentence.split(/\s+/).filter(Boolean).length);
  const avgLength = sentenceLengths.reduce((sum, length) => sum + length, 0) / sentences.length || 0;

  // Calculate length distribution
  const shortSentences = sentenceLengths.filter(len => len <= 10).length;
  const mediumSentences = sentenceLengths.filter(len => len > 10 && len <= 20).length;
  const longSentences = sentenceLengths.filter(len => len > 20).length;

  return {
    avg_length: avgLength,
    length_distribution: {
      short: shortSentences / sentences.length || 0,
      medium: mediumSentences / sentences.length || 0,
      long: longSentences / sentences.length || 0
    },
    complexity_score: Math.min(1, avgLength / 25),
    question_frequency: (text.match(/\?/g) || []).length / sentences.length || 0,
    fragment_frequency: sentences.filter(s => s.split(/\s+/).filter(Boolean).length < 5).length / sentences.length || 0
  };
};

// Calculate vocabulary metrics
const calculateVocabularyMetrics = (text) => {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));

  return {
    lexical_diversity: uniqueWords.size / words.length || 0,
    formality_score: 0.65, // Placeholder
    unusual_word_frequency: 0.05, // Placeholder
    part_of_speech_distribution: {
      nouns: 0.25,
      verbs: 0.2,
      adjectives: 0.15,
      adverbs: 0.08
    }
  };
};

// Analyze narrative characteristics
const analyzeNarrativeCharacteristics = (text) => {
  // Simple POV detection
  const firstPersonIndicators = (text.match(/\b(I|me|my|mine|we|us|our|ours)\b/gi) || []).length;
  const thirdPersonIndicators = (text.match(/\b(he|him|his|she|her|hers|they|them|their|theirs)\b/gi) || []).length;
  
  let pov = "unknown";
  if (firstPersonIndicators > thirdPersonIndicators * 2) {
    pov = "first_person";
  } else if (thirdPersonIndicators > firstPersonIndicators) {
    pov = "third_person";
  }

  // Tense detection
  const presentTenseIndicators = (text.match(/\b(is|are|am|being|do|does|has|have)\b/gi) || []).length;
  const pastTenseIndicators = (text.match(/\b(was|were|had|did)\b/gi) || []).length;

  let tense = "unknown";
  if (presentTenseIndicators > pastTenseIndicators * 1.5) {
    tense = "present";
  } else if (pastTenseIndicators > presentTenseIndicators) {
    tense = "past";
  }

  return {
    pov,
    tense,
    description_density: 0.4, // Placeholder
    action_to_reflection_ratio: 1.5,
    show_vs_tell_balance: 0.65
  };
};

// Analyze stylistic devices
const analyzeStyleDevices = (text) => {
  return {
    metaphor_frequency: 0.02, // Placeholder
    simile_frequency: 0.015,
    alliteration_frequency: 0.008,
    repetition_patterns: 0.03
  };
};

// Analyze tone
const analyzeTone = (text) => {
  // Simplified tone analysis
  const positiveWords = ['happy', 'joy', 'love', 'excellent', 'good', 'great'];
  const negativeWords = ['sad', 'angry', 'hate', 'terrible', 'bad', 'awful'];
  const formalWords = ['therefore', 'furthermore', 'consequently', 'nevertheless'];

  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const positiveCount = words.filter(word => positiveWords.includes(word)).length;
  const negativeCount = words.filter(word => negativeWords.includes(word)).length;
  const formalCount = words.filter(word => formalWords.includes(word)).length;

  let emotionalTone = [];
  if (positiveCount > negativeCount * 2) {
    emotionalTone.push('optimistic');
  } else if (negativeCount > positiveCount * 2) {
    emotionalTone.push('pessimistic');
  } else {
    emotionalTone.push('neutral');
  }

  // Add more tones based on other heuristics
  const formality = formalCount / words.length > 0.01 ? 'formal' : 'casual';

  return {
    emotional_tone: emotionalTone,
    formality_level: formality,
    humor_level: 0.2, // Placeholder
    sarcasm_level: 0.1 // Placeholder
  };
};

// Create excerpt from text (first 200 characters)
const createExcerpt = (text) => {
  // Get first 200 characters, but try to end at a sentence boundary
  const excerpt = text.slice(0, 200);
  const lastPeriod = excerpt.lastIndexOf('.');
  if (lastPeriod > 100) {
    return excerpt.slice(0, lastPeriod + 1);
  }
  return excerpt + '...';
};

// Generate a summary description of the style
const generateDescription = (
  sentenceMetrics,
  vocabularyMetrics,
  narrativeCharacteristics,
  stylistic,
  tone
) => {
  const sentenceLength = sentenceMetrics.avg_length < 12 ? 'short' :
    sentenceMetrics.avg_length < 20 ? 'moderate' : 'long';
  
  const complexity = sentenceMetrics.complexity_score < 0.4 ? 'simple' :
    sentenceMetrics.complexity_score < 0.7 ? 'moderately complex' : 'complex';
  
  const diversity = vocabularyMetrics.lexical_diversity < 0.4 ? 'limited' :
    vocabularyMetrics.lexical_diversity < 0.6 ? 'varied' : 'highly diverse';
  
  const formality = tone.formality_level === 'formal' ? 'formal' : 'conversational';
  
  const povText = narrativeCharacteristics.pov === 'first_person' ? 'first-person' :
    narrativeCharacteristics.pov === 'third_person' ? 'third-person' : 'mixed perspective';
  
  const tenseText = narrativeCharacteristics.tense === 'present' ? 'present tense' :
    narrativeCharacteristics.tense === 'past' ? 'past tense' : 'mixed tense';

  return `This writing features ${sentenceLength}, ${complexity} sentences with ${diversity} vocabulary. The style is ${formality}, written in ${povText} ${tenseText}. ${tone.emotional_tone.join(' and ')} in tone, with a ${narrativeCharacteristics.action_to_reflection_ratio > 1 ? 'focus on action over reflection' : 'balance of action and reflection'}.`;
};

// Format style guidance based on parameters
const formatStyleGuidance = (styleParameters) => {
  let guidance = "# Style Guidance\n\n";

  // Sentence structure
  if (styleParameters.sentence) {
    const sentenceLength = styleParameters.sentence.avg_length < 12 ? 'short' :
      styleParameters.sentence.avg_length < 20 ? 'moderate' : 'long';
    
    guidance += `## Sentence Structure\n`;
    guidance += `- Use predominantly ${sentenceLength} sentences (average ${Math.round(styleParameters.sentence.avg_length)} words per sentence)\n`;
    if (styleParameters.sentence.length_distribution) {
      guidance += `- Sentence variety: ${Math.round(styleParameters.sentence.length_distribution.short * 100)}% short, ${Math.round(styleParameters.sentence.length_distribution.medium * 100)}% medium, ${Math.round(styleParameters.sentence.length_distribution.long * 100)}% long\n`;
    }
    guidance += `- Complexity: ${styleParameters.sentence.complexity < 0.4 ? 'simple and direct' : styleParameters.sentence.complexity < 0.7 ? 'moderately complex' : 'complex with multiple clauses'}\n`;
    guidance += `- Question frequency: ${styleParameters.sentence.questions ? 'Include occasional questions' : 'Rarely use questions'}\n\n`;
  }

  // Vocabulary
  if (styleParameters.vocabulary) {
    guidance += `## Vocabulary\n`;
    guidance += `- Lexical diversity: ${styleParameters.vocabulary.diversity < 0.4 ? 'Limited - use repetition and simple words' : styleParameters.vocabulary.diversity < 0.6 ? 'Moderate - mix familiar words with occasional distinctive ones' : 'High - use varied, precise vocabulary'}\n`;
    guidance += `- Formality: ${styleParameters.vocabulary.formality === 'formal' ? 'Formal academic tone' : styleParameters.vocabulary.formality === 'neutral' ? 'Balanced, professional tone' : 'Conversational, casual tone'}\n`;
    
    if (styleParameters.vocabulary.avoid) {
      guidance += `- Avoid these terms: ${styleParameters.vocabulary.avoid.join(', ')}\n`;
    }
    if (styleParameters.vocabulary.prefer) {
      guidance += `- Preferred terms: ${styleParameters.vocabulary.prefer.join(', ')}\n`;
    }
    guidance += '\n';
  }

  // Narrative
  if (styleParameters.narrative) {
    guidance += `## Narrative Approach\n`;
    guidance += `- Point of view: ${styleParameters.narrative.pov === 'first_person' ? 'First person' : styleParameters.narrative.pov === 'second_person' ? 'Second person' : 'Third person'}\n`;
    guidance += `- Tense: ${styleParameters.narrative.tense === 'present' ? 'Present tense' : 'Past tense'}\n`;
    guidance += `- Description vs. action balance: ${styleParameters.narrative.description_heavy ? 'Favor rich description' : 'Favor action and plot movement'}\n\n`;
  }

  // Tone
  if (styleParameters.tone) {
    guidance += `## Tone\n`;
    if (styleParameters.tone.emotional && styleParameters.tone.emotional.length > 0) {
      guidance += `- Emotional tone: ${styleParameters.tone.emotional.join(', ')}\n`;
    }
    if (styleParameters.tone.formality) {
      guidance += `- Formality: ${styleParameters.tone.formality}\n`;
    }
    if (styleParameters.tone.humor) {
      guidance += `- Humor level: ${styleParameters.tone.humor === 'high' ? 'Include humor and wit' : styleParameters.tone.humor === 'medium' ? 'Occasional light humor' : 'Serious, minimal humor'}\n\n`;
    }
  }

  // Stylistic devices
  if (styleParameters.devices) {
    guidance += `## Stylistic Devices\n`;
    const devices = [];
    if (styleParameters.devices.metaphors) devices.push('metaphors');
    if (styleParameters.devices.similes) devices.push('similes');
    if (styleParameters.devices.alliteration) devices.push('alliteration');
    if (styleParameters.devices.repetition) devices.push('repetition');
    
    if (devices.length > 0) {
      guidance += `- Use these devices: ${devices.join(', ')}\n`;
    }
    if (styleParameters.devices.avoid) {
      guidance += `- Avoid these devices: ${styleParameters.devices.avoid.join(', ')}\n`;
    }
    guidance += '\n';
  }

  // Comparable authors
  if (styleParameters.comparable_authors && styleParameters.comparable_authors.length > 0) {
    guidance += `## Similar Authors\n`;
    guidance += `- Emulate the style of: ${styleParameters.comparable_authors.join(', ')}\n\n`;
  }

  // User comments
  if (styleParameters.user_comments) {
    guidance += `## Additional Notes\n`;
    guidance += styleParameters.user_comments + '\n\n';
  }

  return guidance;
};

// Function implementations with database access

// Analyze writing sample with database access
const analyzeWritingSample = async (args) => {
  try {
    const { text, sampleId, saveSample, title, author, sampleType, tags, projectId } = args;

    // 1. Calculate all the metrics
    const sentenceMetrics = calculateSentenceMetrics(text);
    const vocabularyMetrics = calculateVocabularyMetrics(text);
    const narrativeCharacteristics = analyzeNarrativeCharacteristics(text);
    const stylisticDevices = analyzeStyleDevices(text);
    const toneAttributes = analyzeTone(text);

    // Generate a descriptive summary
    const descriptiveSummary = generateDescription(
      sentenceMetrics,
      vocabularyMetrics,
      narrativeCharacteristics,
      stylisticDevices,
      toneAttributes
    );

    // 2. If sampleId is provided, use it; otherwise create a new sample if saveSample is true
    let sample_id = sampleId;
    
    if (!sample_id && saveSample) {
      if (!title) {
        throw new Error("Title is required when saving a new sample");
      }

      // Create a new sample
      const { data: newSample, error: sampleError } = await supabase
        .from('writing_samples')
        .insert({
          title,
          content: text,
          author: author || null,
          sample_type: sampleType || null,
          tags: tags || [],
          project_id: projectId,
          excerpt: createExcerpt(text)
        })
        .select()
        .single();

      if (sampleError) {
        throw new Error(`Failed to save sample: ${sampleError.message}`);
      }

      console.error(`Created new sample with ID: ${newSample.id}`);
      sample_id = newSample.id;
    }

    // 3. Store the analysis if we have a sample_id
    let analysisResult = null;
    if (sample_id) {
      const { data: analysis, error: analysisError } = await supabase
        .from('style_analyses')
        .insert({
          sample_id,
          sentence_metrics: sentenceMetrics,
          vocabulary_metrics: vocabularyMetrics,
          narrative_characteristics: narrativeCharacteristics,
          stylistic_devices: stylisticDevices,
          tone_attributes: toneAttributes,
          descriptive_summary: descriptiveSummary,
          comparable_authors: [] // Would be populated by a more sophisticated algorithm
        })
        .select()
        .single();

      if (analysisError) {
        throw new Error(`Failed to save analysis: ${analysisError.message}`);
      }

      console.error(`Created style analysis with ID: ${analysis.id}`);
      analysisResult = analysis;
    }

    // 4. Return the analysis results
    return {
      sample_id,
      metrics: {
        sentence_metrics: sentenceMetrics,
        vocabulary_metrics: vocabularyMetrics,
        narrative_characteristics: narrativeCharacteristics,
        stylistic_devices: stylisticDevices,
        tone_attributes: toneAttributes
      },
      summary: descriptiveSummary
    };
  } catch (error) {
    console.error("Error in analyzeWritingSample:", error);
    throw new Error(`Failed to analyze writing sample: ${error.message}`);
  }
};

// Get style profile with database access
const getStyleProfile = async (args) => {
  try {
    const { profileId, includeExamples, includeStyleNotes } = args;

    // 1. Fetch the style profile
    const { data: profile, error: profileError } = await supabase
      .from('style_profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch style profile: ${profileError.message}`);
    }

    if (!profile) {
      throw new Error(`Style profile with ID ${profileId} not found`);
    }

    // 2. Fetch related sample IDs
    const { data: profileSamples, error: samplesError } = await supabase
      .from('profile_samples')
      .select('sample_id')
      .eq('profile_id', profileId);

    if (samplesError) {
      throw new Error(`Failed to fetch profile samples: ${samplesError.message}`);
    }

    const sampleIds = profileSamples.map(ps => ps.sample_id);

    // 3. Fetch representative samples
    const { data: representativeSamples, error: repSamplesError } = await supabase
      .from('representative_samples')
      .select('*')
      .eq('profile_id', profileId);

    if (repSamplesError) {
      throw new Error(`Failed to fetch representative samples: ${repSamplesError.message}`);
    }

    // 4. If including examples, fetch sample excerpts
    let examples = [];
    if (includeExamples && sampleIds.length > 0) {
      const { data: samples, error: examplesError } = await supabase
        .from('writing_samples')
        .select('title, excerpt')
        .in('id', sampleIds)
        .limit(3); // Limit to 3 examples for brevity

      if (examplesError) {
        throw new Error(`Failed to fetch sample excerpts: ${examplesError.message}`);
      }

      examples = samples.map(s => ({
        title: s.title,
        excerpt: s.excerpt
      }));

      // Add representative samples if available
      if (representativeSamples && representativeSamples.length > 0) {
        representativeSamples.forEach(rs => {
          examples.push({
            title: rs.description || "Representative Sample",
            excerpt: rs.text_content
          });
        });
      }
    }

    // 5. Format the response
    const response = {
      profile: {
        id: profile.id,
        name: profile.name,
        description: profile.description,
        parameters: profile.style_parameters,
        genre: profile.genre || [],
        comparable_authors: profile.comparable_authors || [],
        user_comments: profile.user_comments
      }
    };

    // 6. Add formatted style guidance if requested
    if (includeStyleNotes) {
      response.style_guidance = formatStyleGuidance({
        ...profile.style_parameters,
        comparable_authors: profile.comparable_authors,
        user_comments: profile.user_comments
      });
    }

    // 7. Add examples if requested and available
    if (includeExamples && examples.length > 0) {
      response.examples = examples;
    }

    return response;
  } catch (error) {
    console.error("Error in getStyleProfile:", error);
    throw new Error(`Failed to retrieve style profile: ${error.message}`);
  }
};

// Helper to combine metrics from multiple analyses
const combineMetrics = (analyses) => {
  if (!analyses || analyses.length === 0) {
    return null;
  }

  // For sentence metrics
  const avgSentenceLength = analyses.reduce((sum, a) => sum + (a.sentence_metrics?.avg_length || 0), 0) / analyses.length;

  // Distribution calculations
  let shortTotal = 0, mediumTotal = 0, longTotal = 0;
  analyses.forEach(a => {
    if (a.sentence_metrics?.length_distribution) {
      shortTotal += a.sentence_metrics.length_distribution.short || 0;
      mediumTotal += a.sentence_metrics.length_distribution.medium || 0;
      longTotal += a.sentence_metrics.length_distribution.long || 0;
    }
  });

  // Average complexity
  const complexityScore = analyses.reduce((sum, a) => sum + (a.sentence_metrics?.complexity_score || 0), 0) / analyses.length;

  // Question frequency
  const questionFrequency = analyses.reduce((sum, a) => sum + (a.sentence_metrics?.question_frequency || 0), 0) / analyses.length;

  // Combine vocabulary metrics
  const lexicalDiversity = analyses.reduce((sum, a) => sum + (a.vocabulary_metrics?.lexical_diversity || 0), 0) / analyses.length;
  const formalityScore = analyses.reduce((sum, a) => sum + (a.vocabulary_metrics?.formality_score || 0), 0) / analyses.length;

  // Determine POV
  const povCounts = {};
  analyses.forEach(a => {
    const pov = a.narrative_characteristics?.pov;
    if (pov) {
      povCounts[pov] = (povCounts[pov] || 0) + 1;
    }
  });
  let dominantPov = "unknown";
  let maxCount = 0;
  Object.keys(povCounts).forEach(pov => {
    if (povCounts[pov] > maxCount) {
      dominantPov = pov;
      maxCount = povCounts[pov];
    }
  });

  // Determine tense
  const tenseCounts = {};
  analyses.forEach(a => {
    const tense = a.narrative_characteristics?.tense;
    if (tense) {
      tenseCounts[tense] = (tenseCounts[tense] || 0) + 1;
    }
  });
  let dominantTense = "unknown";
  maxCount = 0;
  Object.keys(tenseCounts).forEach(tense => {
    if (tenseCounts[tense] > maxCount) {
      dominantTense = tense;
      maxCount = tenseCounts[tense];
    }
  });

  // Calculate action to reflection ratio
  const actionRatio = analyses.reduce((sum, a) => sum + (a.narrative_characteristics?.action_to_reflection_ratio || 1), 0) / analyses.length;

  // Collect emotional tones
  const tones = new Set();
  analyses.forEach(a => {
    if (a.tone_attributes?.emotional_tone) {
      a.tone_attributes.emotional_tone.forEach(tone => tones.add(tone));
    }
  });

  // Determine formality level
  const formalityLevels = {};
  analyses.forEach(a => {
    const level = a.tone_attributes?.formality_level;
    if (level) {
      formalityLevels[level] = (formalityLevels[level] || 0) + 1;
    }
  });
  let dominantFormality = "neutral";
  maxCount = 0;
  Object.keys(formalityLevels).forEach(level => {
    if (formalityLevels[level] > maxCount) {
      dominantFormality = level;
      maxCount = formalityLevels[level];
    }
  });

  // Extract most frequent literary devices
  const deviceFrequencies = {
    metaphor: analyses.reduce((sum, a) => sum + (a.stylistic_devices?.metaphor_frequency || 0), 0) / analyses.length,
    simile: analyses.reduce((sum, a) => sum + (a.stylistic_devices?.simile_frequency || 0), 0) / analyses.length,
    alliteration: analyses.reduce((sum, a) => sum + (a.stylistic_devices?.alliteration_frequency || 0), 0) / analyses.length,
    repetition: analyses.reduce((sum, a) => sum + (a.stylistic_devices?.repetition_patterns || 0), 0) / analyses.length
  };

  // Collect authors
  const authors = new Set();
  analyses.forEach(a => {
    if (a.comparable_authors) {
      a.comparable_authors.forEach(author => authors.add(author));
    }
  });

  // Build the consolidated metrics
  return {
    sentence: {
      avg_length: avgSentenceLength,
      short: shortTotal / analyses.length,
      medium: mediumTotal / analyses.length,
      long: longTotal / analyses.length,
      complexity: complexityScore,
      questions: questionFrequency > 0.05
    },
    vocabulary: {
      diversity: lexicalDiversity,
      formality: formalityScore > 0.6 ? 'formal' : formalityScore > 0.4 ? 'neutral' : 'casual',
    },
    narrative: {
      pov: dominantPov,
      tense: dominantTense,
      description_heavy: actionRatio < 1,
      action_ratio: actionRatio
    },
    tone: {
      emotional: Array.from(tones),
      formality: dominantFormality,
      humor: "low" // Default, would be more sophisticated in real implementation
    },
    devices: {
      metaphors: deviceFrequencies.metaphor > 0.01,
      similes: deviceFrequencies.simile > 0.01,
      alliteration: deviceFrequencies.alliteration > 0.01,
      repetition: deviceFrequencies.repetition > 0.01
    },
    comparable_authors: Array.from(authors)
  };
};

// Create or update a style profile with database access
const createStyleProfile = async (args) => {
  try {
    const { 
      name, 
      description, 
      sampleIds, 
      projectId, 
      profileId,
      genre,
      comparableAuthors,
      userComments,
      representativeSamples,
      addToExisting
    } = args;

    // 1. Verify all sample IDs exist
    const { data: samples, error: samplesError } = await supabase
      .from('writing_samples')
      .select('id')
      .in('id', sampleIds);

    if (samplesError) {
      throw new Error(`Failed to verify samples: ${samplesError.message}`);
    }

    if (samples.length !== sampleIds.length) {
      throw new Error(`Some sample IDs do not exist. Found ${samples.length} of ${sampleIds.length} requested samples.`);
    }

    // 2. Fetch style analyses for all samples
    const { data: analyses, error: analysesError } = await supabase
      .from('style_analyses')
      .select('*')
      .in('sample_id', sampleIds);

    if (analysesError) {
      throw new Error(`Failed to fetch style analyses: ${analysesError.message}`);
    }

    if (analyses.length === 0) {
      throw new Error(`No style analyses found for the provided samples. Please analyze the samples first.`);
    }

    // 3. Combine the analyses to create a composite style profile
    const styleParameters = combineMetrics(analyses);

    // If updating an existing profile, we might need to merge with existing parameters
    if (profileId && addToExisting) {
      // Fetch existing profile
      const { data: existingProfile, error: profileError } = await supabase
        .from('style_profiles')
        .select('*')
        .eq('id', profileId)
        .single();
      
      if (profileError) {
        throw new Error(`Failed to fetch existing profile: ${profileError.message}`);
      }

      // Merge comparable authors if provided
      if (comparableAuthors && comparableAuthors.length > 0) {
        const existingAuthors = existingProfile.comparable_authors || [];
        styleParameters.comparable_authors = [...new Set([...existingAuthors, ...comparableAuthors])];
      }
    } else if (comparableAuthors && comparableAuthors.length > 0) {
      // Set comparable authors directly for new profiles
      styleParameters.comparable_authors = comparableAuthors;
    }

    // 4. Create or update the style profile
    let profile;
    if (profileId) {
      // Update existing profile
      const updateData = {
        name,
        description,
        style_parameters: styleParameters,
        updated_at: new Date().toISOString()
      };

      // Only add these fields if they're provided
      if (genre) updateData.genre = genre;
      if (userComments) updateData.user_comments = userComments;
      if (projectId) updateData.project_id = projectId;

      const { data: updatedProfile, error: updateError } = await supabase
        .from('style_profiles')
        .update(updateData)
        .eq('id', profileId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update style profile: ${updateError.message}`);
      }

      profile = updatedProfile;
      console.error(`Updated profile with ID: ${profile.id}`);

      // If not adding to existing, delete the old profile-sample associations
      if (!addToExisting) {
        await supabase
          .from('profile_samples')
          .delete()
          .eq('profile_id', profileId);
        
        console.error(`Deleted existing sample associations for profile: ${profile.id}`);
      }
    } else {
      // Create new profile
      const newProfileData = {
        name,
        description,
        style_parameters: styleParameters,
        project_id: projectId,
        genre: genre || [],
        comparable_authors: styleParameters.comparable_authors || [],
        user_comments: userComments
      };

      const { data: newProfile, error: createError } = await supabase
        .from('style_profiles')
        .insert(newProfileData)
        .select()
        .single();

      if (createError) {
        throw new Error(`Failed to create style profile: ${createError.message}`);
      }

      profile = newProfile;
      console.error(`Created new profile with ID: ${profile.id}`);
    }

    // 5. Create profile-sample associations for the new samples
    const profileSamples = sampleIds.map(sampleId => ({
      profile_id: profile.id,
      sample_id: sampleId,
      weight: 1.0 // Default equal weight
    }));

    const { error: associationError } = await supabase
      .from('profile_samples')
      .insert(profileSamples);

    if (associationError) {
      throw new Error(`Failed to create profile-sample associations: ${associationError.message}`);
    }

    console.error(`Created ${profileSamples.length} sample associations for profile: ${profile.id}`);

    // 6. Create representative samples if provided
    if (representativeSamples && representativeSamples.length > 0) {
      const repSamples = representativeSamples.map(rs => ({
        profile_id: profile.id,
        text_content: rs.textContent,
        description: rs.description
      }));

      const { error: repSampleError } = await supabase
        .from('representative_samples')
        .insert(repSamples);

      if (repSampleError) {
        throw new Error(`Failed to create representative samples: ${repSampleError.message}`);
      }

      console.error(`Created ${repSamples.length} representative samples for profile: ${profile.id}`);
    }

    // 7. Return the created/updated profile
    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      parameters: styleParameters,
      sample_count: sampleIds.length,
      genre: genre || [],
      comparable_authors: styleParameters.comparable_authors || [],
      user_comments: userComments
    };
  } catch (error) {
    console.error("Error in createStyleProfile:", error);
    throw new Error(`Failed to create style profile: ${error.message}`);
  }
};

// Write in a specific style with database access
const writeInStyle = async (args) => {
  try {
    const { profileId, prompt, length, includeStyleNotes } = args;

    // 1. Fetch the style profile
    const { data: profile, error: profileError } = await supabase
      .from('style_profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch style profile: ${profileError.message}`);
    }

    if (!profile) {
      throw new Error(`Style profile with ID ${profileId} not found`);
    }

    // 2. Fetch a couple of sample excerpts as examples if available
    const { data: profileSamples, error: pSamplesError } = await supabase
      .from('profile_samples')
      .select('sample_id')
      .eq('profile_id', profileId)
      .limit(2);

    if (pSamplesError) {
      throw new Error(`Failed to fetch profile samples: ${pSamplesError.message}`);
    }

    let examples = [];
    if (profileSamples.length > 0) {
      const sampleIds = profileSamples.map(ps => ps.sample_id);
      
      const { data: samples, error: samplesError } = await supabase
        .from('writing_samples')
        .select('title, excerpt')
        .in('id', sampleIds);
      
      if (samplesError) {
        throw new Error(`Failed to fetch sample excerpts: ${samplesError.message}`);
      }

      examples = samples.map(s => ({
        title: s.title,
        excerpt: s.excerpt
      }));
    }

    // 3. Fetch representative samples if available
    const { data: representativeSamples, error: repSamplesError } = await supabase
      .from('representative_samples')
      .select('*')
      .eq('profile_id', profileId)
      .limit(3);

    if (repSamplesError) {
      throw new Error(`Failed to fetch representative samples: ${repSamplesError.message}`);
    }

    if (representativeSamples && representativeSamples.length > 0) {
      representativeSamples.forEach(rs => {
        examples.push({
          title: rs.description || "Representative Sample",
          excerpt: rs.text_content
        });
      });
    }

    // 4. Format the style guidance
    const styleGuidance = includeStyleNotes ? formatStyleGuidance({
      ...profile.style_parameters,
      comparable_authors: profile.comparable_authors,
      user_comments: profile.user_comments
    }) : "";

    // 5. Prepare the writing instructions
    const lengthInstruction = length ? `Write approximately ${length} words.` : "";

    return {
      profile_name: profile.name,
      style_guidance: styleGuidance,
      writing_prompt: prompt,
      length_instruction: lengthInstruction,
      examples: examples,
      parameters: profile.style_parameters
    };
  } catch (error) {
    console.error("Error in writeInStyle:", error);
    throw new Error(`Failed to prepare writing instructions: ${error.message}`);
  }
};

// Initialize MCP server
const server = new Server(
  {
    name: "StoryVerse MCP Server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("Received list_tools request");
  return { 
    tools: [
      analyzeWritingSampleTool,
      getStyleProfileTool,
      createStyleProfileTool,
      writeInStyleTool
    ] 
  };
});

// Register tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    console.error(`Received call_tool request for: ${request.params.name}`);
    const { name, arguments: args } = request.params;
    
    // Handle analyze_writing_sample
    if (name === 'analyze_writing_sample') {
      if (!args.text) {
        throw new Error("Text is required for analysis");
      }
      
      const result = await analyzeWritingSample(args);
      
      return {
        content: [
          {
            type: "text",
            text: `Successfully analyzed the writing sample.\n\n${result.summary}`,
          },
          {
            type: "json",
            json: result
          }
        ],
      };
    }
    
    // Handle get_style_profile
    if (name === 'get_style_profile') {
      if (!args.profileId) {
        throw new Error("Profile ID is required");
      }
      
      const result = await getStyleProfile(args);
      
      // Format the response for Claude
      let responseText = `# ${result.profile.name}\n\n`;
      if (result.profile.description) {
        responseText += `${result.profile.description}\n\n`;
      }

      if (result.style_guidance) {
        responseText += result.style_guidance;
      }

      if (result.examples && result.examples.length > 0) {
        responseText += "\n\n## Example Passages\n\n";
        result.examples.forEach((example) => {
          responseText += `### ${example.title}\n\n`;
          responseText += `"${example.excerpt}"\n\n`;
        });
      }
      
      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
          {
            type: "json",
            json: result
          }
        ],
      };
    }
    
    // Handle create_style_profile
    if (name === 'create_style_profile') {
      if (!args.name || !args.sampleIds || !args.sampleIds.length) {
        throw new Error("Name and at least one sample ID are required");
      }
      
      const result = await createStyleProfile(args);
      
      return {
        content: [
          {
            type: "text",
            text: `Successfully ${args.profileId ? (args.addToExisting ? 'updated' : 'replaced') : 'created'} style profile "${result.name}" based on ${result.sample_count} samples.`,
          },
          {
            type: "json",
            json: result
          }
        ],
      };
    }
    
    // Handle write_in_style
    if (name === 'write_in_style') {
      if (!args.prompt) {
        throw new Error("Writing prompt is required");
      }
      
      const result = await writeInStyle(args);
      
      // Format the response for Claude
      let responseText = `# Writing Request: ${result.writing_prompt}\n\n`;
      responseText += `Please write in the style of profile "${result.profile_name}". ${result.length_instruction}\n\n`;

      if (result.style_guidance) {
        responseText += result.style_guidance + "\n\n";
      }

      if (result.examples && result.examples.length > 0) {
        responseText += "## Example Passages In This Style\n\n";
        result.examples.forEach((example) => {
          responseText += `### ${example.title}\n\n`;
          responseText += `"${example.excerpt}"\n\n`;
        });
      }

      responseText += "## Your Task\n\n";
      responseText += `Write about: ${result.writing_prompt}\n\n`;
      
      return {
        content: [
          {
            type: "text",
            text: responseText,
          }
        ],
      };
    }
    
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    console.error("Error in call_tool handler:", error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Create function to run SQL script against Supabase
const runSqlSetup = async () => {
  try {
    console.error("Running database setup script...");
    const fs = require('fs');
    const sqlScript = fs.readFileSync('./db-updates.sql', 'utf8');
    
    // Split the script into individual statements
    const statements = sqlScript.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      const { error } = await supabase.rpc('run_sql', { sql: statement + ';' });
      if (error) {
        console.error(`Error running SQL: ${error.message}`);
        // Continue with other statements even if one fails
      }
    }
    
    console.error("Database setup complete");
  } catch (error) {
    console.error(`Error setting up database: ${error.message}`);
    // Continue with server startup even if DB setup fails
  }
};

// Start server with DB initialization
async function runServer() {
  try {
    console.error("Starting MCP server...");
    
    // Try to run database setup
    await runSqlSetup().catch(err => console.error("DB setup error:", err));
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("StoryVerse MCP Server running with database access");
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

runServer();