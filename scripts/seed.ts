import "dotenv/config";
import { supabase } from "../server/supabase";
import { randomUUID } from "crypto";
import { type EmotionType } from "@shared/schema";

const seedData: Array<{
    title: string;
    summary: string;
    content: string;
    source: string;
    image: string;
    category: string;
    emotion: EmotionType;
    intensity: number;
}> = [
        { title: 'Scientists Discover New Species of Colorful Bird in Amazon', summary: 'A vibrant new species brings hope for biodiversity conservation efforts in the rainforest.', content: 'A vibrant new species brings hope for biodiversity conservation efforts in the rainforest. Researchers are excited about what this means for ecosystem preservation. The discovery was made deep in the Amazon basin, where a team of ornithologists spent three months documenting wildlife.', source: 'Nature Today', image: 'https://images.unsplash.com/photo-1444464666168-49d633b86797?w=800', category: 'Science', emotion: 'joy', intensity: 85 },
        { title: 'Local Community Garden Project Wins National Award', summary: 'The initiative has transformed urban spaces and brought neighbors together.', content: 'The initiative has transformed urban spaces and brought neighbors together. Over 200 families now have access to fresh produce. The project started five years ago with just a small plot of land and has grown into a model for urban agriculture.', source: 'Good News Daily', image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800', category: 'Community', emotion: 'joy', intensity: 92 },
        { title: 'Breakthrough in Renewable Energy Efficiency Announced', summary: 'New solar panel technology promises 40% better performance at lower costs.', content: 'New solar panel technology promises 40% better performance at lower costs. Industry experts call it a game-changer for clean energy adoption. The innovation uses a novel material composition that captures a broader spectrum of light.', source: 'Tech Progress', image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800', category: 'Technology', emotion: 'joy', intensity: 78 },
        { title: 'Young Musician Overcomes Challenges to Win Competition', summary: 'Her inspiring story of perseverance touched hearts worldwide.', content: 'Her inspiring story of perseverance touched hearts worldwide. The 16-year-old pianist will now tour major concert halls. Despite facing numerous obstacles, she practiced for hours daily and her dedication finally paid off.', source: 'Arts Daily', image: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=800', category: 'Arts', emotion: 'joy', intensity: 88 },

        { title: 'Major Policy Changes Announced Without Public Input', summary: 'Government reveals controversial new regulations affecting millions.', content: 'Government reveals controversial new regulations affecting millions. Critics demand transparency and accountability from officials. The sudden announcement has sparked widespread debate about democratic processes.', source: 'News Alert', image: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800', category: 'Politics', emotion: 'anger', intensity: 95 },
        { title: 'Corporate Scandal Uncovered by Investigators', summary: 'Years of misconduct finally brought to light.', content: 'Years of misconduct finally brought to light. Executives face potential criminal charges as evidence mounts. Whistleblowers played a crucial role in exposing the systematic fraud.', source: 'Investigative Report', image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800', category: 'Business', emotion: 'anger', intensity: 88 },
        { title: 'Environmental Protection Rollback Sparks Outrage', summary: 'Critics call the decision shortsighted and dangerous.', content: 'Critics call the decision shortsighted and dangerous. Environmental groups vow legal action to protect endangered habitats. Scientists warn of irreversible consequences for ecosystems.', source: 'Eco Watch', image: 'https://images.unsplash.com/photo-1569163139599-0f4517e36f51?w=800', category: 'Environment', emotion: 'anger', intensity: 82 },
        { title: 'Workers Protest After Sudden Factory Closures', summary: 'Thousands left without jobs or severance.', content: 'Thousands left without jobs or severance. Union leaders demand immediate negotiations with management. The closures came without warning, leaving communities devastated.', source: 'Labor News', image: 'https://images.unsplash.com/photo-1591189824344-9739f8d12cc3?w=800', category: 'Economy', emotion: 'anger', intensity: 79 },

        { title: 'Community Mourns Loss of Historic Landmark', summary: 'The 200-year-old building held memories for generations.', content: 'The 200-year-old building held memories for generations. Residents gather to share stories and photographs. The structure was a symbol of the community heritage and cultural identity.', source: 'Heritage News', image: 'https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?w=800', category: 'Culture', emotion: 'sadness', intensity: 75 },
        { title: 'Rising Sea Levels Threaten Coastal Communities', summary: 'Families face difficult decisions about their futures.', content: 'Families face difficult decisions about their futures. Some have lived in these areas for generations. Climate scientists project the situation will only worsen in coming decades.', source: 'Climate Report', image: 'https://images.unsplash.com/photo-1559825481-12a05cc00344?w=800', category: 'Climate', emotion: 'sadness', intensity: 82 },
        { title: 'Remembering the Life of Influential Artist', summary: 'A tribute to the creative spirit that touched millions.', content: 'A tribute to the creative spirit that touched millions through her paintings and sculptures. Her work continues to inspire new generations of artists around the world.', source: 'Arts & Culture', image: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800', category: 'Arts', emotion: 'sadness', intensity: 68 },
        { title: 'Last Surviving Member of Historic Expedition Passes', summary: 'Her stories of adventure inspired countless explorers.', content: 'Her stories of adventure and discovery inspired countless young explorers. She was 102 years old. Her memoirs remain essential reading for anyone interested in exploration history.', source: 'History Today', image: 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=800', category: 'History', emotion: 'sadness', intensity: 71 },

        { title: 'Cybersecurity Experts Warn of Sophisticated Threat', summary: 'Advanced attack methods require immediate attention.', content: 'Advanced attack methods require immediate attention from organizations. Experts recommend urgent security audits. The new threat targets critical infrastructure systems.', source: 'Security Bulletin', image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800', category: 'Technology', emotion: 'fear', intensity: 90 },
        { title: 'Economic Uncertainty Grows Amid Global Tensions', summary: 'Markets react to escalating international concerns.', content: 'Markets react to escalating international concerns. Analysts recommend cautious investment strategies. Economists are divided on the long-term outlook.', source: 'Financial Times', image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800', category: 'Finance', emotion: 'fear', intensity: 85 },
        { title: 'Health Officials Monitor Emerging Situation', summary: 'Precautionary measures being implemented nationwide.', content: 'Precautionary measures being implemented nationwide. Officials urge calm while staying vigilant. Hospitals are preparing contingency plans.', source: 'Health Watch', image: 'https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?w=800', category: 'Health', emotion: 'fear', intensity: 78 },
        { title: 'Severe Weather Patterns Expected to Intensify', summary: 'Meteorologists predict challenging conditions ahead.', content: 'Meteorologists predict challenging conditions ahead. Emergency preparedness is recommended for affected regions. Climate models suggest increased frequency of extreme events.', source: 'Weather Alert', image: 'https://images.unsplash.com/photo-1527482937786-6f4c1b89a73c?w=800', category: 'Weather', emotion: 'fear', intensity: 73 },

        { title: 'Mindfulness Programs Show Positive Results', summary: 'Students report better focus and reduced anxiety.', content: 'Students report better focus and reduced anxiety after implementation. Teachers notice improved classroom atmosphere. The program combines meditation with breathing exercises.', source: 'Education Today', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800', category: 'Wellness', emotion: 'calm', intensity: 65 },
        { title: 'New Nature Reserve Opens to the Public', summary: 'Pristine wilderness now accessible for peaceful retreats.', content: 'Pristine wilderness now accessible for peaceful retreats. Visitors can enjoy walking trails and meditation spots. The reserve spans over 5,000 acres of untouched forest.', source: 'Outdoor Life', image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800', category: 'Nature', emotion: 'calm', intensity: 55 },
        { title: 'Ancient Meditation Techniques Gain Scientific Backing', summary: 'Research validates centuries-old practices for wellness.', content: 'Research validates centuries-old practices for mental wellness. Brain scans show measurable improvements in practitioners. The study followed participants over two years.', source: 'Wellness Journal', image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800', category: 'Science', emotion: 'calm', intensity: 48 },
        { title: 'Remote Mountain Village Becomes Wellness Destination', summary: 'Visitors find peace in the simple way of life.', content: 'Visitors find peace in the simple way of life. Digital detox retreats are fully booked for months ahead. The village offers traditional healing practices and organic cuisine.', source: 'Travel & Wellness', image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800', category: 'Travel', emotion: 'calm', intensity: 52 },
    ];

async function seed() {
    console.log("Seeding database...");

    try {
        // Clear existing data (optional, but good for idempotent runs)
        // await supabase.from('news_items').delete().neq('id', '0'); 

        for (const item of seedData) {
            const { error } = await supabase.from('news_items').insert({
                id: randomUUID(),
                title: item.title,
                summary: item.summary,
                content: item.content,
                source: item.source,
                image: item.image,
                category: item.category,
                emotion: item.emotion,
                intensity: item.intensity,
                views: Math.floor(Math.random() * 5000) + 100,
                saves: Math.floor(Math.random() * 500),
                platforms: ['interactive']
            });

            if (error) {
                console.error(`Failed to insert ${item.title}:`, error.message);
            } else {
                console.log(`Inserted: ${item.title}`);
            }
        }
        console.log("Seeding complete!");
        process.exit(0);
    } catch (error) {
        console.error("Seeding failed:", error);
        process.exit(1);
    }
}

seed();
