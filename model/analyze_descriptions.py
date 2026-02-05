import csv
import os

def analyze_descriptions(csv_file, output_file="description_comparison.txt"):
    """
    Analyze CSV file and extract records with physical descriptions.
    
    Args:
        csv_file: Path to the CSV file
        output_file: Path to save the comparison results
    """
    print(f"Analyzing {csv_file}...")
    
    records_physical_only = []
    records_both = []
    
    try:
        with open(csv_file, 'r', encoding='utf-8', errors='replace') as f:
            reader = csv.DictReader(f)
            
            # Print available columns for debugging
            print(f"\nAvailable columns in CSV:")
            for i, col in enumerate(reader.fieldnames, 1):
                print(f"  {i}. '{col}'")
            print()
            
            # Find the correct column names (case-insensitive and flexible)
            columns = {col.lower(): col for col in reader.fieldnames}
            
            # Try to find title column
            title_col = None
            for key in ['title', 'name', 'book title', 'item title']:
                if key in columns:
                    title_col = columns[key]
                    break
            
            # Try to find description column
            desc_col = None
            for key in ['description', 'desc', 'summary']:
                if key in columns:
                    desc_col = columns[key]
                    break
            
            # Try to find physical description column
            phys_col = None
            for key in ['physical description', 'physicaldescription', 'physical', 'format']:
                if key in columns:
                    phys_col = columns[key]
                    break
            
            # Try to find notes column
            notes_col = None
            for key in ['notes', 'note']:
                if key in columns:
                    notes_col = columns[key]
                    break
            
            print(f"Using columns:")
            print(f"  Title: '{title_col}'")
            print(f"  Description: '{desc_col}'")
            print(f"  Physical Description: '{phys_col}'")
            print(f"  Notes: '{notes_col}'")
            print()
            
            if not title_col:
                print("Warning: Could not find title column!")
            if not phys_col:
                print("Warning: Could not find physical description column!")
            
            row_count = 0
            for row in reader:
                row_count += 1
                
                title = row.get(title_col, 'N/A').strip() if title_col else 'N/A'
                description = row.get(desc_col, '').strip() if desc_col else ''
                physical_desc = row.get(phys_col, '').strip() if phys_col else ''
                notes = row.get(notes_col, '').strip() if notes_col else ''
                
                # Debug: Print first few rows
                if row_count <= 3:
                    print(f"Sample row {row_count}:")
                    print(f"  Title: {title[:50]}...")
                    print(f"  Description: {'Yes' if description else 'No'} ({len(description)} chars)")
                    print(f"  Physical Desc: {'Yes' if physical_desc else 'No'} ({len(physical_desc)} chars)")
                    print(f"  Notes: {'Yes' if notes else 'No'} ({len(notes)} chars)")
                    print()
                
                # Records with only physical description
                if physical_desc and not description:
                    if len(records_physical_only) < 50:
                        records_physical_only.append({
                            'title': title,
                            'physical_desc': physical_desc,
                            'notes': notes
                        })
                
                # Records with both descriptions
                elif physical_desc and description:
                    if len(records_both) < 50:
                        records_both.append({
                            'title': title,
                            'description': description,
                            'physical_desc': physical_desc,
                            'notes': notes
                        })
                
                # Stop when we have enough records
                if len(records_physical_only) >= 50 and len(records_both) >= 50:
                    break
            
            print(f"Total rows scanned: {row_count}")
        
        # Write results to file
        with open(output_file, 'w', encoding='utf-8') as out:
            out.write("=" * 100 + "\n")
            out.write("COMPARISON: Physical Description vs Normal Description\n")
            out.write("=" * 100 + "\n\n")
            
            # Section 1: Only Physical Description
            out.write(f"\n{'=' * 100}\n")
            out.write(f"RECORDS WITH ONLY PHYSICAL DESCRIPTION (Total: {len(records_physical_only)})\n")
            out.write(f"{'=' * 100}\n\n")
            
            for i, record in enumerate(records_physical_only, 1):
                out.write(f"\n{'-' * 100}\n")
                out.write(f"Record #{i}\n")
                out.write(f"{'-' * 100}\n")
                out.write(f"Title: {record['title']}\n\n")
                out.write(f"Physical Description:\n{record['physical_desc']}\n")
                if record.get('notes'):
                    out.write(f"\nNotes:\n{record['notes']}\n")
            
            # Section 2: Both Descriptions
            out.write(f"\n\n{'=' * 100}\n")
            out.write(f"RECORDS WITH BOTH DESCRIPTIONS (Total: {len(records_both)})\n")
            out.write(f"{'=' * 100}\n\n")
            
            for i, record in enumerate(records_both, 1):
                out.write(f"\n{'-' * 100}\n")
                out.write(f"Record #{i}\n")
                out.write(f"{'-' * 100}\n")
                out.write(f"Title: {record['title']}\n\n")
                out.write(f"Normal Description:\n{record['description']}\n\n")
                out.write(f"Physical Description:\n{record['physical_desc']}\n")
                if record.get('notes'):
                    out.write(f"\nNotes:\n{record['notes']}\n")
        
        print(f"\nAnalysis complete!")
        print(f"- Records with only physical description: {len(records_physical_only)}")
        print(f"- Records with both descriptions: {len(records_both)}")
        print(f"- Results saved to: {output_file}")
        
        # Also print summary to console
        if records_physical_only:
            print(f"\n{'=' * 100}")
            print("PREVIEW - First 3 records with only physical description:")
            print(f"{'=' * 100}")
            for i, record in enumerate(records_physical_only[:3], 1):
                print(f"\n{i}. {record['title']}")
                print(f"   Physical: {record['physical_desc'][:100]}...")
                if record.get('notes'):
                    print(f"   Notes: {record['notes'][:100]}...")
        
        if records_both:
            print(f"\n{'=' * 100}")
            print("PREVIEW - First 3 records with both descriptions:")
            print(f"{'=' * 100}")
            for i, record in enumerate(records_both[:3], 1):
                print(f"\n{i}. {record['title']}")
                print(f"   Normal: {record['description'][:80]}...")
                print(f"   Physical: {record['physical_desc'][:80]}...")
                if record.get('notes'):
                    print(f"   Notes: {record['notes'][:80]}...")
        
    except FileNotFoundError:
        print(f"Error: File '{csv_file}' not found.")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Try both possible CSV files
    csv_file = "complete_records_fixed.csv"
    if not os.path.exists(csv_file):
        csv_file = "complete_records.csv"
    
    if os.path.exists(csv_file):
        analyze_descriptions(csv_file)
    else:
        print("Error: No CSV file found.")
        print("Please run getCSVinfo.py first or ensure CSV file exists.")
