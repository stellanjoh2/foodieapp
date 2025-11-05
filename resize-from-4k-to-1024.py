#!/usr/bin/env python3
"""
Resize original 4K texture images down to 1024x1024
Maintains aspect ratio - images will be at most 1024px on the largest side
"""

import os
from PIL import Image
import sys

# You can specify a source directory with original 4K files, or use current directory
SOURCE_DIR = '3d-assets/textures'  # Change this if your original 4K files are elsewhere
TARGET_DIR = '3d-assets/textures'
MAX_SIZE = 1024

def resize_textures():
    if not os.path.exists(SOURCE_DIR):
        print(f"Error: Source directory '{SOURCE_DIR}' not found")
        print(f"\nPlease update SOURCE_DIR in the script to point to your original 4K textures")
        sys.exit(1)
    
    # Get all PNG files
    files = [f for f in os.listdir(SOURCE_DIR) if f.lower().endswith('.png')]
    
    if not files:
        print(f"No PNG files found in {SOURCE_DIR}")
        sys.exit(1)
    
    print(f"Found {len(files)} PNG files...")
    print(f"Source: {SOURCE_DIR}")
    print(f"Target: {TARGET_DIR}\n")
    
    # Check if any files are actually 4K
    has_4k = False
    for file in files[:5]:  # Check first 5 files
        file_path = os.path.join(SOURCE_DIR, file)
        try:
            img = Image.open(file_path)
            if img.size[0] >= 2048 or img.size[1] >= 2048:
                has_4k = True
                print(f"Found 4K file: {file} ({img.size[0]}x{img.size[1]})")
                break
        except:
            pass
    
    if not has_4k:
        print("⚠️  Warning: No 4K files detected in source directory.")
        print("   Current files appear to be 1024x1024 or smaller.")
        print("   Please specify the correct path to your original 4K textures.\n")
        response = input("Continue anyway? (y/n): ")
        if response.lower() != 'y':
            sys.exit(0)
    
    resized = 0
    skipped = 0
    errors = 0
    
    for file in files:
        source_path = os.path.join(SOURCE_DIR, file)
        target_path = os.path.join(TARGET_DIR, file)
        
        try:
            # Open image
            img = Image.open(source_path)
            original_size = img.size
            
            # Check if resizing is needed
            needs_resize = original_size[0] > MAX_SIZE or original_size[1] > MAX_SIZE
            
            if not needs_resize:
                print(f"✓ {file}: Already {original_size[0]}x{original_size[1]} (no resize needed)")
                skipped += 1
                continue
            
            print(f"Resizing {file}: {original_size[0]}x{original_size[1]} → max {MAX_SIZE}px...")
            
            # Calculate new size maintaining aspect ratio
            ratio = min(MAX_SIZE / original_size[0], MAX_SIZE / original_size[1])
            new_size = (int(original_size[0] * ratio), int(original_size[1] * ratio))
            
            # Resize image using high-quality LANCZOS resampling
            resized_img = img.resize(new_size, Image.Resampling.LANCZOS)
            
            # Save to target (overwrite if same directory)
            resized_img.save(target_path, 'PNG', optimize=True)
            
            print(f"✓ {file}: Resized to {new_size[0]}x{new_size[1]}")
            resized += 1
            
        except Exception as e:
            print(f"✗ Error processing {file}: {e}")
            errors += 1
    
    print('\n=== Resize Complete ===')
    print(f"Resized: {resized}")
    print(f"Skipped: {skipped}")
    print(f"Errors: {errors}")
    
    if resized > 0:
        print(f"\n✓ All textures are now {MAX_SIZE}x{MAX_SIZE} (down from 4K)")

if __name__ == '__main__':
    try:
        resize_textures()
    except ImportError:
        print("Error: PIL (Pillow) is required. Install it with: pip install Pillow")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nCancelled by user")
        sys.exit(0)

