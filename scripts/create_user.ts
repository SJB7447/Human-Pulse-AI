
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nedtvbnodkdmofhvhpbm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lZHR2Ym5vZGtkbW9maHZocGJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NjAyNDAsImV4cCI6MjA4NDQzNjI0MH0.3h-uRTIZdAp8m8IMGxKF2r0uEvB5eWSvETCDQ1pCjE8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestUser() {
    console.log('Creating test user...');
    const { data, error } = await supabase.auth.signUp({
        email: 'test@donga.com',
        password: 'password123',
    });

    if (error) {
        console.error('Error creating user:', error.message);
    } else {
        console.log('User created successfully:', data.user?.email);
        console.log('Please check if email verification is required.');
    }
}

createTestUser();
